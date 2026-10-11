import type { ConfigurationService } from "../configuration/service.ts";
import { AiSdkAdapter } from "../model/ai-sdk.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ToolDeclaration } from "../model/contract.ts";
import type { SystemPrompt } from "../model/system-prompt.ts";
import { runAgent, type RunOptions, type RunTermination } from "../execution/loop.ts";
import type { AgentCapabilities } from "../execution/capabilities.ts";
import type { ModelItem } from "../session/projection.ts";
import { modelReference, parseModelExpression, resolveProviderModel, type ConfigurationSnapshot, type ThinkingLevel } from "../shared/configuration.ts";
import type { ModelSettings } from "../shared/model.ts";
import { PluginApiError } from "./contract.ts";

/** 模型目标：选择一个角色，可覆盖模型表达式或思考等级；未给出的沿用角色。 */
export interface ModelTarget { role: string; model?: string; thinking?: ThinkingLevel }
export type ModelTargetError = "role_unavailable" | "model_unavailable" | "credential_unavailable";
export class ModelTargetFailure extends PluginApiError {
  constructor(readonly reason: ModelTargetError, message: string) { super("unavailable", message); }
}

/** 插件可见的稳定目录视图：不含端点、凭据与兼容参数。 */
export interface RegistryView {
  roles(): { id: string; name: string; description: string; hidden: boolean; model: string | null; thinking: ThinkingLevel | null }[];
  models(): { model: string; provider: string; name: string; contextWindow: number | null; capabilities: { reasoning: boolean; tools: boolean; images: boolean } }[];
  agents(): { id: string; name: string; description: string; role: string | null; systemPrompt: string; tools: string[] | null;
    excludeTools: string[] | null; timeout: number | null; maxTurns: number | null; maxCost: number | null }[];
}
export interface ResolvedTarget { settings: ModelSettings; adapter: ModelAdapter }
export interface StreamRequest { target: ModelTarget; system: SystemPrompt; messages: ModelItem[]; tools?: ToolDeclaration[]; signal: AbortSignal }
/** run：无状态封装宿主代理循环；上下文、提示与策略由调用方每次请求重新给出。 */
export interface RunRequest extends Omit<RunOptions, "environment"> {
  environment: () => Promise<{ target: ModelTarget; prompt: { id: string; systemPrompt: string }; maxTurns: number | null;
    capabilities: AgentCapabilities; messages: ModelItem[]; requestParentId: string | null; context: { file: string; text: string }[] }>;
}
export interface PluginModels {
  /** 解析目标到实际模型与适配器；失败以 ModelTargetFailure 区分原因。 */
  resolve(target: ModelTarget): Promise<ResolvedTarget>;
  stream(request: StreamRequest): AsyncIterable<ModelEvent>;
  run(request: RunRequest): Promise<RunTermination>;
}

/** 按角色与覆盖解析；模型不支持 reasoning 时思考归为 off。 */
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
  return { ok: true, model, thinking: resolved.model.capabilities.reasoning ? thinking : "off" };
}

export function createModelServices(configuration: ConfigurationService, adapterFactory?: (settings: ModelSettings) => ModelAdapter): { registry: RegistryView; models: PluginModels } {
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
  const registry: RegistryView = {
    roles: () => current().roles.filter(role => role.enabled).map(role => ({ id: role.id, name: role.name, description: role.description,
      hidden: role.hidden, model: role.model, thinking: role.thinking })),
    models: () => {
      const config = current();
      return config.models.filter(model => resolveProviderModel(config, modelReference(model))).map(model => ({ model: modelReference(model),
        provider: model.providerId, name: model.name, contextWindow: model.contextWindow, capabilities: { ...model.capabilities } }));
    },
    agents: () => current().agents.filter(agent => agent.enabled).map(agent => ({ id: agent.id, name: agent.name, description: agent.description,
      role: agent.modelRole, systemPrompt: agent.systemPrompt, tools: agent.tools, excludeTools: agent.excludeTools, timeout: agent.timeout, maxTurns: agent.maxTurns, maxCost: agent.maxCost })),
  };
  return { registry, models: {
    resolve,
    async *stream(request) {
      const { settings, adapter } = await resolve(request.target);
      yield* adapter.prepare({ settings, system: request.system, messages: request.messages,
        tools: settings.model.capabilities.tools ? request.tools ?? [] : [] }).stream(request.signal);
    },
    run: request => runAgent({ ...request, environment: async () => {
      const { target, ...rest } = await request.environment();
      try { return { ...rest, ...await resolve(target) }; }
      catch (error) { if (error instanceof ModelTargetFailure) throw new ModelFailure(error.reason, error.message); throw error; }
    } }),
  } };
}
