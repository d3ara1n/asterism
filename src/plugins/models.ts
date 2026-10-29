import type { ConfigurationService } from "../configuration/service.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import { runModelRequest } from "../execution/request.ts";
import { formatModelExpression, type ModelRunRequest, type ModelRunResult, type ModelTarget, type StreamRequest, type SystemPrompt } from "@asterism-app/sdk/contracts";
import { modelReference, parseModelExpression, resolveProviderModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { modelExpression, modelScope, type ModelSettings } from "../shared/model.ts";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { ModelServices } from "@asterism-app/sdk/runtime";
import { inputReferences, validateInput, resolveInput, type ModelContent } from "../model/input.ts";
import type { ModelItem } from "@asterism-app/sdk/contracts";
import { errorMessages } from "../shared/error-display.ts";

/** Model targets identify concrete provider/model pairs; paradigms resolve their own configuration. */
export type { ModelTarget, StreamRequest } from "@asterism-app/sdk/contracts";
export type ModelTargetError = "model_unavailable" | "credential_unavailable";
export class ModelTargetFailure extends PluginApiError {
  constructor(readonly reason: ModelTargetError, message: string) { super("unavailable", message); }
}

interface ResolvedTarget { settings: ModelSettings; adapter: ModelAdapter }
/** Host transport inputs; tools and conversation correlation are supplied by the consumer. */
export interface RunRequest extends Omit<ModelRunRequest, "system"> {
  system: SystemPrompt | Promise<SystemPrompt>;
  content?: HostInputOptions["content"];
}
interface HostInputOptions { content?: (messages: readonly ModelItem[]) => ModelContent | undefined }
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
  if (provider.auth === "api_key" && provider.credentialState !== "available") return { ok: false, reason: "credential_unavailable" };
  return { ok: true, model, thinking };
}

export function createModelServices(configuration: ConfigurationService, adapterFactory?: (settings: ModelSettings) => ModelAdapter): HostModels {
  // Refresh credential availability before requests; catalog reads synchronously use current configuration.
  const current = () => configuration.current();
  const resolve = async (target: ModelTarget, execute = true): Promise<ResolvedTarget> => {
    await configuration.execute({ type: "read" });
    const config = current();
    const result = resolveTarget(config, target);
    if (!result.ok) throw new ModelTargetFailure(result.reason, `The model target ${target.provider}/${target.model} is unavailable (${result.reason}).`);
    const { model, provider } = resolveProviderModel(config, result.model)!;
    const { credentialState: _state, ...connection } = provider;
    const settings: ModelSettings = { provider: connection, model, thinking: result.thinking };
    const credential = adapterFactory || !execute ? null : await configuration.executionCredential(connection.id);
    const adapter = adapterFactory?.(settings)
      ?? new AiSdkAdapter(async () => credential);
    return { settings, adapter };
  };
  const catalog = {
    models: () => {
      const config = current();
      return config.models.filter(model => resolveProviderModel(config, modelReference(model))).map(model => ({ model: modelReference(model),
        provider: model.providerId, name: model.name, contextWindow: model.contextWindow, capabilities: { ...model.capabilities } }));
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
        validateInput(messages, content);
        adapter.validate({ settings, system, messages, userAgent, sessionId,
          tools: [] });
      } catch (error) {
        if (error instanceof PluginApiError) throw error;
        if (request.signal.aborted) throw error;
        throw new PluginApiError("invalid_argument", error instanceof ModelFailure ? error.message : "The model request could not be prepared.",
          error instanceof ModelFailure ? error.code : undefined,
          error instanceof ModelFailure && error.code === "tool_files_unsupported" ? errorMessages.tool_files_unsupported : undefined);
      } finally { await content?.close(); }
    },
    async *stream(request, options) {
      request.signal.throwIfAborted();
      const { target, system, messages, tools, maxOutputTokens, userAgent, sessionId } = structuredClone({
        target: request.target, system: request.system, messages: request.messages, tools: request.tools, maxOutputTokens: request.maxOutputTokens,
        userAgent: request.userAgent, sessionId: request.sessionId,
      });
      const content = capture(messages, options?.content);
      try {
        const { settings, adapter } = await resolve(target);
        const resolvedMessages = await resolveInput(messages, content, request.signal);
        const source = { model: modelExpression(settings), adapter: adapter.version, scope: modelScope(settings) };
        for await (const event of adapter.prepare({ settings, system, messages: resolvedMessages, maxOutputTokens, userAgent, sessionId,
          tools: settings.model.capabilities.tools ? tools ?? [] : [] }).stream(request.signal)) {
          request.signal.throwIfAborted();
          yield event.type === "finish" ? { ...event, source } : event;
        }
      } finally { await content?.close(); }
    },
    run(request) {
      const system = request.system instanceof Promise ? request.system : structuredClone(request.system);
      const { messages, target, userAgent, sessionId } = structuredClone({
        messages: request.messages, target: request.target, userAgent: request.userAgent, sessionId: request.sessionId,
      });
      let content: ModelContent | undefined;
      let captured: Promise<void>;
      try { request.signal.throwIfAborted(); content = capture(messages, request.content); captured = Promise.resolve(); }
      catch (error) { captured = Promise.reject(error); }
      const preparation = [resolve(target), Promise.resolve(system), captured] as const;
      const environment = Promise.all(preparation).then(async ([resolved, preparedSystem]) => ({
        ...resolved, userAgent, sessionId, tools: request.tools,
        messages: await resolveInput(messages, content, request.signal),
        system: structuredClone(preparedSystem),
      })).catch(error => {
        if (error instanceof ModelTargetFailure) throw new ModelFailure(error.reason, error.message);
        throw error;
      });
      return runModelRequest(request, environment).finally(async () => {
        await Promise.allSettled(preparation);
        await content?.close();
      });
    },
  };
}
