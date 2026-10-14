import type { ConfigurationService } from "../configuration/service.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import { runModelRequest } from "../execution/request.ts";
import type { ModelRunRequest, ModelRunResult, ModelTarget, StreamRequest } from "@atelier/sdk/contracts";
import type { AgentCapabilities } from "../execution/capabilities.ts";
import { modelReference, parseModelExpression, resolveProviderModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import { modelExpression, modelScope, type ModelSettings } from "../shared/model.ts";
import { PluginApiError } from "@atelier/sdk/runtime";
import type { ModelServices } from "@atelier/sdk/runtime";
import { coreDeclarations } from "../execution/core.ts";
import { coreId } from "../shared/core.ts";
import { inputReferences, validateInput, resolveInput, type ModelContent } from "../model/input.ts";
import type { ModelItem } from "@atelier/sdk/contracts";
import { errorMessages } from "../shared/error-display.ts";

/** 模型目标：选择一个角色，可覆盖模型表达式或思考等级；未给出的沿用角色。 */
export type { ModelTarget, StreamRequest } from "@atelier/sdk/contracts";
export type ModelTargetError = "role_unavailable" | "model_unavailable" | "credential_unavailable";
export class ModelTargetFailure extends PluginApiError {
  constructor(readonly reason: ModelTargetError, message: string) { super("unavailable", message); }
}

interface ResolvedTarget { settings: ModelSettings; adapter: ModelAdapter }
/** 内部 adapter 的一次调用输入；授权视图与资源环境取用不进入公开 SDK。 */
export interface RunRequest extends ModelRunRequest {
  /** 宿主打戳的写入插件身份，用于响应块来源。 */
  /** 发起请求的插件身份，由宿主填写；用于响应块来源打戳。 */
  plugin: string;
  capabilities: AgentCapabilities;
  context: Promise<{ file: string; text: string }[]>;
  content?: HostInputOptions["content"];
  /** 工具暂存内容的交接占用；结果记录登记内容根前保持可读，请求结束后释放。 */
  handover?: () => ContentLease | undefined;
}
interface HostInputOptions { content?: (messages: readonly ModelItem[]) => ModelContent | undefined }
export interface HostModels {
  stream(request: StreamRequest, options?: HostInputOptions): AsyncIterable<ModelEvent>;
  run(request: RunRequest): Promise<ModelRunResult>;
  validate(request: Parameters<ModelServices["validate"]>[0], options?: HostInputOptions): Promise<void>;
  roles: ModelServices["roles"];
  list: ModelServices["list"];
}

/** 按角色与覆盖解析，思考可用性与请求过滤由模型适配层解释。 */
export function resolveTarget(snapshot: ConfigurationSnapshot, target: ModelTarget):
  { ok: true; model: string; thinking: ThinkingLevel | null } | { ok: false; reason: ModelTargetError } {
  const role = snapshot.roles.find(item => item.id === target.role);
  if (!role?.enabled) return { ok: false, reason: "role_unavailable" };
  const model = target.model ?? role.model;
  if (!model || !parseModelExpression(model)) return { ok: false, reason: "model_unavailable" };
  const resolved = resolveProviderModel(snapshot, model);
  if (!resolved) return { ok: false, reason: "model_unavailable" };
  const { provider } = resolved;
  if (provider.auth === "api_key" && provider.credentialState !== "available") return { ok: false, reason: "credential_unavailable" };
  const thinking = target.thinking !== undefined ? target.thinking : role.thinking;
  return { ok: true, model, thinking };
}

export function createModelServices(configuration: ConfigurationService, adapterFactory?: (settings: ModelSettings) => ModelAdapter): HostModels {
  // 请求前刷新凭据可用性；目录读取同步取当前配置。
  const snapshot = async () => (await configuration.execute({ type: "read" })).snapshot;
  const current = () => configuration.current();
  const resolve = async (target: ModelTarget): Promise<ResolvedTarget> => {
    const config = await snapshot();
    const result = resolveTarget(config, target);
    if (!result.ok) throw new ModelTargetFailure(result.reason, `The model target for role ${target.role} is unavailable (${result.reason}).`);
    const { model, provider } = resolveProviderModel(config, result.model)!;
    const { credentialState: _state, ...connection } = provider;
    const settings: ModelSettings = { provider: connection, model, thinking: result.thinking };
    let credential: Promise<string | null> | undefined;
    const adapter = adapterFactory?.(settings)
      ?? new AiSdkAdapter(() => credential ??= configuration.executionCredential(connection.id, connection.revision));
    return { settings, adapter };
  };
  const catalog = {
    roles: () => current().roles.filter(role => role.enabled).map(role => ({ id: role.id, name: role.name, description: role.description,
      hidden: role.hidden, model: role.model, thinking: role.thinking })),
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
    roles: catalog.roles,
    list: catalog.models,
    async validate(request, options) {
      request.signal.throwIfAborted();
      const { target, system, messages } = structuredClone({ target: request.target, system: request.system, messages: request.messages });
      let content: ModelContent | undefined;
      try {
        content = capture(messages, options?.content);
        const { settings, adapter } = await resolve(target);
        request.signal.throwIfAborted();
        validateInput(messages, content);
        adapter.validate({ settings, system, messages,
          tools: settings.model.capabilities.tools ? coreDeclarations() : [] });
      } catch (error) {
        if (error instanceof PluginApiError) throw error;
        if (request.signal.aborted) throw error;
        throw new PluginApiError("invalid_argument", error instanceof ModelFailure ? error.message : "The model request could not be prepared.",
          error instanceof ModelFailure ? error.code : undefined,
          error instanceof ModelFailure && error.code === "thinking_unavailable" ? errorMessages.thinking_unavailable : undefined);
      } finally { await content?.close(); }
    },
    async *stream(request, options) {
      request.signal.throwIfAborted();
      const { target, system, messages, tools } = structuredClone({
        target: request.target, system: request.system, messages: request.messages, tools: request.tools,
      });
      const content = capture(messages, options?.content);
      try {
        const { settings, adapter } = await resolve(target);
        const resolvedMessages = await resolveInput(messages, content, request.signal);
        const source = { model: modelExpression(settings), adapter: adapter.version, scope: modelScope(settings) };
        for await (const event of adapter.prepare({ settings, system, messages: resolvedMessages,
          tools: settings.model.capabilities.tools ? tools ?? [] : [] }).stream(request.signal)) {
          request.signal.throwIfAborted();
          yield event.type === "finish" ? { ...event, source } : event;
        }
      } finally { await content?.close(); }
    },
    run(request) {
      const { system, messages, target } = structuredClone({ system: request.system, messages: request.messages, target: request.target });
      let content: ModelContent | undefined;
      let captured: Promise<void>;
      try { request.signal.throwIfAborted(); content = capture(messages, request.content); captured = Promise.resolve(); }
      catch (error) { captured = Promise.reject(error); }
      const environment = Promise.all([resolve(target), request.context, captured]).then(async ([resolved, context]) => ({
        ...resolved, capabilities: request.capabilities, messages: await resolveInput(messages, content, request.signal),
        system: { blocks: [...system.blocks, ...context.map((file, index) => ({
          id: coreId(`context.${index}`), kind: "context" as const, ...file,
        }))] },
      })).catch(error => {
        if (error instanceof ModelTargetFailure) throw new ModelFailure(error.reason, error.message);
        throw error;
      });
      const handover = request.handover?.();
      return runModelRequest(request, environment, handover).finally(() => Promise.all([content?.close(), handover?.close()]));
    },
  };
}
