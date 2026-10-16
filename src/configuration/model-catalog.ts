import { Models, type Catalog, type Model, type ModelMetadata } from "@opencode-ai/models";
import { z } from "zod";
import { modelInputSchema, thinkingSchema, type ProviderModel, type ModelParameterUpdate } from "../shared/configuration.ts";
import { modelCatalogMessages as messages } from "../shared/model-catalog-messages.ts";
import { emptyModelRates, modelCostSchema, type ModelCost, type ModelRates, type UnitPrice } from "@atelier/sdk/contracts";
import { ConfigurationError } from "./errors.ts";

export type LoadModelCatalog = (signal: AbortSignal) => Promise<Catalog>;
const client = Models.make({ fetch: (url, init) => fetch(url, { ...init, redirect: "error" }) });
/** 官方客户端持有目录类型与传输；不向目录发送提供商凭据，不静默使用旧快照。 */
export const loadModelCatalog: LoadModelCatalog = signal => client.catalog({ signal });

type Match = { source: string; model: Model | ModelMetadata };
/** 仅供参数检索：去掉厂商／路由前缀，不改写保存或发送的服务端模型 ID。 */
const parameterModelId = (id: string): string => id.slice(id.lastIndexOf("/") + 1);

function selectModel(catalog: Catalog, modelId: string): Match {
  const lookupId = parameterModelId(modelId);
  if (!lookupId) throw new ConfigurationError("not_found", "No exact model catalog match was found.", messages.notFound);
  const matches: Match[] = [];
  for (const [key, metadata] of Object.entries(catalog.models)) {
    // 目录键的首段是 models.dev 的厂商分组，不是用户模型 ID 的另一种形式。
    const slash = key.indexOf("/");
    if (slash < 1) continue;
    const lab = key.slice(0, slash);
    const entryId = key.slice(slash + 1);
    const native = catalog.providers[lab]?.models[entryId];
    if (parameterModelId(native?.id ?? entryId) === lookupId) matches.push({ source: key, model: native ?? metadata });
  }
  if (matches.length > 1) throw new ConfigurationError("conflict", "Multiple catalog models match this ID.", messages.ambiguous);
  const match = matches[0];
  if (!match) throw new ConfigurationError("not_found", "No exact model catalog match was found.", messages.notFound);
  return match;
}

// 只校验实际消费的字段；不复制 SDK 的完整目录 schema。
const entrySchema = z.object({
  cost: z.unknown().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  limit: z.object({ context: z.number().int().nonnegative(), output: z.number().int().nonnegative().optional() }).optional(),
  reasoning_options: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("effort"), values: z.array(z.string().nullable()) }),
    z.object({ type: z.literal("toggle") }),
    z.object({ type: z.literal("budget_tokens") }),
  ])).optional(),
});

// 外部目录的形状只存在于转换边界，配置与消费者使用工坊自己的价格契约。
const catalogPrice = z.number().nonnegative();
const catalogRatesSchema = z.strictObject({
  input: catalogPrice, output: catalogPrice,
  cache_read: catalogPrice.optional(), cache_write: catalogPrice.optional(),
  reasoning: catalogPrice.optional(), input_audio: catalogPrice.optional(), output_audio: catalogPrice.optional(),
});
const catalogCostSchema = catalogRatesSchema.extend({
  context_over_200k: z.unknown().optional(),
  tiers: z.array(catalogRatesSchema.extend({
    tier: z.strictObject({ type: z.literal("context"), size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  })).optional(),
});
function tokenPrice(amount: number | undefined): UnitPrice | null {
  return amount === undefined ? null : { amount, unit: "token", per: 1_000_000 };
}
function modelRates(value: z.infer<typeof catalogRatesSchema>): ModelRates {
  const rates = emptyModelRates();
  rates.text = {
    input: tokenPrice(value.input), output: tokenPrice(value.output),
    cacheRead: tokenPrice(value.cache_read), cacheWrite: tokenPrice(value.cache_write), reasoning: tokenPrice(value.reasoning),
  };
  rates.audio.input = tokenPrice(value.input_audio);
  rates.audio.output = tokenPrice(value.output_audio);
  // 未提供的模态与计费项保持未知，不从文本单价推断图片、音频或视频价格。
  return rates;
}
function modelCost(raw: unknown): ModelCost | null {
  const parsed = catalogCostSchema.safeParse(raw);
  if (!parsed.success) return null;
  const cost = parsed.data;
  const tiers = cost.tiers?.map(tier => ({ fromInputTokens: tier.tier.size, rates: modelRates(tier) })) ?? [];
  if (cost.tiers === undefined && cost.context_over_200k !== undefined) {
    const legacy = catalogRatesSchema.safeParse(cost.context_over_200k);
    if (!legacy.success) return null;
    tiers.push({ fromInputTokens: 200_001, rates: modelRates(legacy.data) });
  }
  tiers.sort((left, right) => left.fromInputTokens - right.fromInputTokens);
  const result = modelCostSchema.safeParse({ currency: "USD", rates: modelRates(cost), tiers });
  return result.success ? result.data : null;
}

/** 用户明确获取时覆盖可映射参数；价格整项替换，身份、连接与兼容设置保留。 */
export function modelParameters(catalog: Catalog, current: ProviderModel): {
  value: z.infer<typeof modelInputSchema>; report: ModelParameterUpdate;
} {
  try {
    const match = selectModel(catalog, current.modelId);
    const entry = entrySchema.parse(match.model);
    const { revision: _revision, ...value } = structuredClone(current);
    const unfilled: ModelParameterUpdate["unfilled"] = [];
    if (entry.limit?.context) value.contextWindow = entry.limit.context;
    else unfilled.push("contextWindow");
    if (entry.limit?.output) value.generation.maxOutputTokens = entry.limit.output;
    else unfilled.push("maxOutputTokens");
    if (entry.reasoning !== undefined) value.capabilities.reasoning = entry.reasoning;
    else unfilled.push("reasoning");
    if (entry.tool_call !== undefined) value.capabilities.tools = entry.tool_call;
    else unfilled.push("tools");

    if (entry.reasoning === false) value.capabilities.thinkingLevels = [];
    else {
      const efforts = entry.reasoning_options?.filter(option => option.type === "effort");
      const values = efforts?.flatMap(option => option.values);
      const levels = new Set(values?.map(level => level === null || level === "none" ? "off" : level));
      const mapped = thinkingSchema.options.filter(level => levels.has(level));
      // toggle/budget 不能直接推导工坊等级；default 也不等于任何固定等级。
      if (!mapped.length || [...levels].some(level => !thinkingSchema.safeParse(level).success)) unfilled.push("thinkingLevels");
      else value.capabilities.thinkingLevels = mapped;
    }
    const cost = modelCost(entry.cost);
    if (cost) value.cost = cost;
    else unfilled.push("cost");
    if (unfilled.length === 6) throw new ConfigurationError("unavailable", "No usable catalog parameters were found.", messages.invalid);
    return { value: modelInputSchema.parse(value), report: { source: match.source, unfilled } };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError("unavailable", "Invalid model catalog data.", messages.invalid);
  }
}
