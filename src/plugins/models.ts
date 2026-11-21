import { randomUUID } from "node:crypto";
import type { ConfigurationService } from "../configuration/service.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import { runModelRequest } from "../execution/request.ts";
import { formatModelExpression, modelInfoSchema, type ModelRunRequest, type ModelRunResult, type ModelTarget, type StreamRequest, type SystemPrompt } from "@asterism-app/sdk/contracts";
import { modelReference, parseModelExpression, resolveProviderModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { modelExpression, modelScope, type ModelSettings } from "../shared/model.ts";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { ModelServices } from "@asterism-app/sdk/runtime";
import { inputReferences, resolveInput, type ModelContent } from "../model/input.ts";
import type { ModelItem, RequestTiming, Usage } from "@asterism-app/sdk/contracts";
import type { ModelUsageRecord, ToolUsageRecord } from "../telemetry/types.ts";

/** Model targets identify concrete provider/model pairs; paradigms resolve their own configuration. */
export type { ModelTarget, StreamRequest } from "@asterism-app/sdk/contracts";
export type ModelTargetError = "model_unavailable" | "credential_unavailable";
export class ModelTargetFailure extends PluginApiError {
  constructor(readonly reason: ModelTargetError, message: string) { super("unavailable", message); }
}

interface ResolvedTarget { settings: ModelSettings; adapter: ModelAdapter }
/** Usage attribution of one model call; execution requests collect their settled tool calls into `tools`. */
export interface ModelCallTelemetry { pluginId: string; purposeId: string | null; tools?: readonly ToolUsageRecord[] }
export type RecordModelUsage = (record: ModelUsageRecord) => void;
/** Cost estimates price only text quantities, so requests carrying files keep an incomplete estimate. */
function hasFileParts(messages: readonly ModelItem[]): boolean {
  return messages.some(item => {
    if (item.kind === "input" || item.kind === "context") return item.parts.some(part => part.kind === "file");
    if (item.kind === "result") return item.outcome.model.some(part => part.kind === "file");
    return false;
  });
}
interface SettledCall {
  id: string | null; timing: RequestTiming | null; usage: Usage | null;
  outcome: ModelUsageRecord["outcome"]; errorOrigin: string | null; errorCode: string | null;
}
function usageRecord(telemetry: ModelCallTelemetry, settings: ModelSettings, sessionId: string | undefined, startedAt: number,
  hasFiles: boolean, settled: SettledCall): ModelUsageRecord {
  const timing = settled.timing;
  return {
    id: settled.id ?? randomUUID(), startedAt: timing ? Date.parse(timing.startedAt) : startedAt,
    durationMs: timing?.durationMs ?? Date.now() - startedAt, firstOutputMs: timing?.firstOutputMs ?? null,
    pluginId: telemetry.pluginId, purposeId: telemetry.purposeId, sessionId: sessionId ?? null,
    providerId: settings.provider.id, providerName: settings.provider.name, modelId: settings.model.modelId, thinking: settings.thinking,
    usage: settled.usage, cost: settings.model.cost, hasFiles,
    outcome: settled.outcome, errorOrigin: settled.errorOrigin, errorCode: settled.errorCode, tools: telemetry.tools ?? [],
  };
}
export interface RunRequest extends Omit<ModelRunRequest, "system"> {
  system: SystemPrompt | Promise<SystemPrompt>;
  content?: HostInputOptions["content"];
  telemetry?: ModelCallTelemetry;
}
interface HostInputOptions {
  content?: (messages: readonly ModelItem[]) => ModelContent | undefined;
  telemetry?: ModelCallTelemetry;
}
export interface HostModels {
  stream(request: StreamRequest, options?: HostInputOptions): AsyncIterable<ModelEvent>;
  run(request: RunRequest): Promise<ModelRunResult>;
  validate(request: Parameters<ModelServices["validate"]>[0], options?: HostInputOptions): Promise<void>;
  list: ModelServices["list"];
}

/** Resolve the requested provider/model pair; adapters interpret reasoning-level encoding and request filtering. */
export function resolveTarget(snapshot: Pick<ConfigurationSnapshot, "modelProviders" | "models">, target: ModelTarget):
  { ok: true; model: string; thinking: ThinkingLevel | null } | { ok: false; reason: ModelTargetError } {
  const model = formatModelExpression(target), thinking = target.thinking ?? null;
  const parsed = parseModelExpression(model);
  if (!parsed || parsed.provider !== target.provider || parsed.model !== target.model)
    return { ok: false, reason: "model_unavailable" };
  const resolved = resolveProviderModel(snapshot, model);
  if (!resolved) return { ok: false, reason: "model_unavailable" };
  const { provider } = resolved;
  if (provider.auth === "api_key" && !provider.apiKey) return { ok: false, reason: "credential_unavailable" };
  return { ok: true, model, thinking };
}

export function createModelServices(configuration: ConfigurationService, adapterFactory?: (settings: ModelSettings) => ModelAdapter,
  recordUsage: RecordModelUsage = () => {}): HostModels {
  // Capture current connection settings before requests; catalog reads remain synchronous.
  const current = () => configuration.modelCatalog();
  const resolve = async (target: ModelTarget, execute = true, signal?: AbortSignal): Promise<ResolvedTarget> => {
    await configuration.execute({ type: "read" });
    const config = current();
    const result = resolveTarget(config, target);
    if (!result.ok) throw new ModelTargetFailure(result.reason, `The model target ${target.provider}/${target.model} is unavailable (${result.reason}).`);
    const { model, provider } = resolveProviderModel(config, result.model)!;
    const { apiKey: _apiKey, ...connection } = provider;
    const settings: ModelSettings = { provider: connection, model, thinking: result.thinking };
    const credential = adapterFactory || !execute ? null : await configuration.executionCredential(connection.id, signal);
    const adapter = adapterFactory?.(settings)
      ?? new AiSdkAdapter(async () => credential);
    return { settings, adapter };
  };
  const catalog = {
    models: () => {
      const config = current();
      return config.models.filter(model => resolveProviderModel(config, modelReference(model))).map(model =>
        modelInfoSchema.parse({ ...model, model: modelReference(model), provider: model.providerId }));
    },
  };
  const capture = (messages: readonly ModelItem[], source?: HostInputOptions["content"]) => {
    if (!inputReferences(messages).length) return undefined;
    if (!source) throw new ModelFailure("content_scope", "The model input requires an authorized content reader.");
    try { return source(messages); }
    catch (error) {
      if (error instanceof ModelFailure) throw error;
      throw new ModelFailure(error instanceof PluginApiError && error.code === "foreign_resource" ? "content_scope" : "content_unavailable",
        error instanceof Error ? error.message : "The model input content is unavailable.");
    }
  };
  return {
    list: catalog.models,
    async validate(request, options) {
      request.signal.throwIfAborted();
      const { target, system, messages, userAgent, sessionId } = structuredClone({
        target: request.target, system: request.system, messages: request.messages, userAgent: request.userAgent, sessionId: request.sessionId,
      });
      let content: ModelContent | undefined;
      try {
        content = capture(messages, options?.content);
        const { settings, adapter } = await resolve(target, false);
        request.signal.throwIfAborted();
        adapter.validate({ settings, system, messages, userAgent, sessionId,
          tools: [] });
      } catch (error) {
        if (error instanceof PluginApiError) throw error;
        if (request.signal.aborted) throw error;
        throw new PluginApiError("invalid_argument", error instanceof ModelFailure ? error.message : "The model request could not be prepared.",
          error instanceof ModelFailure ? error.code : undefined);
      } finally { await content?.close(); }
    },
    async *stream(request, options) {
      request.signal.throwIfAborted();
      const { target, system, messages, tools, maxOutputTokens, userAgent, sessionId } = structuredClone({
        target: request.target, system: request.system, messages: request.messages, tools: request.tools, maxOutputTokens: request.maxOutputTokens,
        userAgent: request.userAgent, sessionId: request.sessionId,
      });
      const startedAt = Date.now();
      const content = capture(messages, options?.content);
      let settings: ModelSettings | null = null;
      let finish: Extract<ModelEvent, { type: "finish" }> | null = null;
      let failure: unknown, failed = false, completed = false;
      try {
        const resolved = await resolve(target, true, request.signal);
        settings = resolved.settings;
        const resolvedMessages = await resolveInput(messages, content, request.signal);
        const source = { model: modelExpression(resolved.settings), adapter: resolved.adapter.format(resolved.settings), scope: modelScope(resolved.settings) };
        for await (const event of resolved.adapter.prepare({ settings: resolved.settings, system, messages: resolvedMessages, maxOutputTokens, userAgent, sessionId,
          tools: resolved.settings.model.capabilities.tools ? tools ?? [] : [] }).stream(request.signal)) {
          request.signal.throwIfAborted();
          if (event.type === "finish") finish = event;
          yield event.type === "finish" ? { ...event, source } : event;
        }
        completed = true;
      } catch (error) {
        failure = error; failed = true;
        throw error;
      } finally {
        await content?.close();
        // A consumer that stops iterating early ends the request without completion or failure.
        if (settings && options?.telemetry) {
          const model = failure instanceof ModelFailure ? failure : null;
          const outcome = completed ? "completed" : failed && !request.signal.aborted ? "failed" : "cancelled";
          recordUsage(usageRecord(options.telemetry, settings, sessionId, startedAt, hasFileParts(messages), {
            id: null, timing: finish?.timing ?? model?.timing ?? null, usage: finish?.usage ?? model?.usage ?? null, outcome,
            errorOrigin: outcome === "failed" ? model?.origin ?? "software" : null, errorCode: outcome === "failed" ? model?.code ?? "stream_failed" : null,
          }));
        }
      }
    },
    run(request) {
      const system = request.system instanceof Promise ? request.system : structuredClone(request.system);
      const { messages, target, userAgent, sessionId } = structuredClone({
        messages: request.messages, target: request.target, userAgent: request.userAgent, sessionId: request.sessionId,
      });
      const startedAt = Date.now();
      let settings: ModelSettings | null = null;
      let content: ModelContent | undefined;
      let captured: Promise<void>;
      try { request.signal.throwIfAborted(); content = capture(messages, request.content); captured = Promise.resolve(); }
      catch (error) { captured = Promise.reject(error); }
      const preparation = [resolve(target, true, request.signal).then(resolved => { settings = resolved.settings; return resolved; }), Promise.resolve(system), captured] as const;
      const environment = Promise.all(preparation).then(async ([resolved, preparedSystem]) => ({
        ...resolved, userAgent, sessionId, tools: request.tools,
        messages: await resolveInput(messages, content, request.signal),
        system: structuredClone(preparedSystem),
      })).catch(error => {
        if (error instanceof ModelTargetFailure) throw new ModelFailure(error.reason, error.message);
        throw error;
      });
      return runModelRequest(request, environment).then(result => {
        // Requests whose target never resolved reached no provider and are not usage.
        const resolved = settings as ModelSettings | null;
        if (resolved && request.telemetry) {
          const termination = result.completion?.termination;
          const generationFailure = termination?.reason === "failed" ? termination : null;
          recordUsage(usageRecord(request.telemetry, resolved, sessionId, startedAt, hasFileParts(messages), {
            id: result.responseId, timing: result.timing, usage: result.completion?.usage ?? null, outcome: result.reason,
            errorOrigin: result.reason === "failed" ? generationFailure?.origin ?? "software" : null,
            errorCode: result.reason === "failed" ? result.code : null,
          }));
        }
        return result;
      }).finally(async () => {
        await Promise.allSettled(preparation);
        await content?.close();
      });
    },
  };
}
