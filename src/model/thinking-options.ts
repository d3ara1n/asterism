import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { ThinkingLevel } from "@atelier/sdk/contracts";
import type { ProviderInput, ProviderModel } from "../shared/configuration.ts";
import { mergeModelCompatibility, type CustomThinkingLevels, type CustomThinkingBudgets } from "../shared/model-compatibility.ts";
import { ModelFailure } from "./contract.ts";

type Model = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["model"];
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
type ActiveLevel = Exclude<ThinkingLevel, "off">;
type Body = Record<string, unknown>;
interface ThinkingMappings { levels: CustomThinkingLevels; budgets: CustomThinkingBudgets }

/** 手动预算按最终总输出上限分配；最小 1024，显式覆盖始终是绝对 token 数。 */
const budgetRatios: Record<ActiveLevel, number> = {
  minimal: 0.02, low: 0.1, medium: 0.3, high: 0.6, xhigh: 0.9, max: 0.95,
};
const defaultManualOutputTokens = 4096;

function object(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ModelFailure("protocol_encoding", "The thinking encoder received an invalid request object.");
  return value as Body;
}

/** 仅修改协议的具名字段；保留同一对象内的摘要、结构化输出等其他参数。 */
function setEffort(body: Body, field: "reasoning" | "output_config", effort: string | null) {
  const values = body[field] === undefined ? {} : { ...object(body[field]) };
  if (effort === null) delete values.effort;
  else values.effort = effort;
  if (Object.keys(values).length) body[field] = values;
  else delete body[field];
}

function resolveEffort(protocol: ProviderInput["protocol"], level: ThinkingLevel, override: string | null | undefined) {
  if (override !== undefined) return override;
  if (level === "off") return "none";
  return protocol === "anthropic" && level === "minimal" ? "low" : level;
}

function encodeAnthropicThinking(body: Body, level: ThinkingLevel, maxOutputTokens: number | undefined, mappings: ThinkingMappings) {
  const customEffort = mappings.levels[level];
  if (level === "off") {
    // 不接受 SDK 将 off 替换成低 effort 或 between_tools；端点不支持时由端点拒绝。
    body.thinking = { type: "disabled" };
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  const thinking = body.thinking === undefined ? undefined : object(body.thinking);
  if (thinking?.type === "enabled") {
    // 不从 SDK 已叠加预算的 max_tokens 反推上限；缺省值也由宿主固定。
    const limit = maxOutputTokens ?? defaultManualOutputTokens;
    const budget = mappings.budgets[level] ?? Math.max(1024, Math.floor(limit * budgetRatios[level]));
    if (!Number.isSafeInteger(budget) || budget < 1024 || budget >= limit)
      throw new ModelFailure("thinking_budget_unavailable", "The thinking budget must be at least 1024 tokens and smaller than the output token limit. Adjust the budget or output limit.");
    body.thinking = { ...thinking, budget_tokens: budget };
    // SDK 会将思考预算额外加到 max_tokens；工坊的上限包含思考，不能被扩大。
    body.max_tokens = limit;
    // 手动预算本身不需要 effort；仅显式映射时才附带，支持两者并存的端点。
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  if (thinking !== undefined && thinking.type !== "adaptive" && thinking.type !== "between_tools")
    throw new ModelFailure("protocol_encoding", "The Messages encoder returned an unsupported thinking mode.");
  setEffort(body, "output_config", resolveEffort("anthropic", level, customEffort));
  if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens;
}

/**
 * SDK 继续识别 Anthropic 模型的思考模式；工坊拥有 effort 与手动预算映射。
 * 每次调用单独捕获选项和传输，不以共享可变状态关联并发请求。
 */
export function withThinkingOptions(
  createModel: (transport: typeof fetch) => Model, transport: typeof fetch,
  provider: Pick<ProviderInput, "protocol" | "compatibility">, model: Pick<ProviderModel, "compatibility">,
) {
  const entries = mergeModelCompatibility(provider.compatibility, model.compatibility);
  const levelsEntry = entries.find(entry => entry.id === "customThinkingLevels");
  const budgetsEntry = entries.find(entry => entry.id === "customThinkingBudgets");
  const mappings: ThinkingMappings = {
    levels: { ...(levelsEntry && "value" in levelsEntry ? levelsEntry.value : {}) as CustomThinkingLevels },
    budgets: { ...(budgetsEntry && "value" in budgetsEntry ? budgetsEntry.value : {}) as CustomThinkingBudgets },
  };
  const protocol = provider.protocol;

  const project = (params: CallOptions) => {
    // probe 与 reasoning:false 都不携带显式等级，也不消费自定义映射。
    if (params.reasoning === undefined || params.reasoning === "provider-default") return null;
    const level: ThinkingLevel = params.reasoning === "none" ? "off" : params.reasoning;
    const effort = resolveEffort(protocol, level, mappings.levels[level]);
    const wireFetch: typeof fetch = (url, init) => {
      if (typeof init?.body !== "string")
        throw new ModelFailure("protocol_encoding", "The thinking encoder requires a serialized request body.");
      const body = object(JSON.parse(init.body));
      if (protocol === "openai-responses") setEffort(body, "reasoning", effort);
      else if (protocol === "openai-chat") {
        if (effort === null) delete body.reasoning_effort;
        else body.reasoning_effort = effort;
      } else encodeAnthropicThinking(body, level, params.maxOutputTokens, mappings);
      return transport(url, { ...init, body: JSON.stringify(body) });
    };
    return createModel(wireFetch);
  };
  return wrapLanguageModel({ model: createModel(transport), middleware: {
    specificationVersion: "v4",
    wrapStream: ({ params, doStream }) => {
      const target = project(params);
      return target ? target.doStream(params) : doStream();
    },
    wrapGenerate: ({ params, doGenerate }) => {
      const target = project(params);
      return target ? target.doGenerate(params) : doGenerate();
    },
  } });
}
