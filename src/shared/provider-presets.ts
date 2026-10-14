import type { UiText } from "@atelier/sdk/contracts";
import { providerInputSchema, type ProviderInput } from "./configuration.ts";

export type ProviderDraft = Omit<ProviderInput, "enabled">;

/**
 * 一个预设对应一种实际连接产品；不同地区、按量／订阅分别声明独立 id。
 * 只包含已核实的连接配置，不声明模型、能力或思考等级。
 * 新增预设只需追加目录项；地区与套餐说明接受可本地化 UiText。
 */
export interface ProviderPreset {
  id: string;
  name: string;
  group: "official" | "aggregator" | "local";
  billing: "usage" | "subscription" | "none";
  region?: UiText;
  plan?: UiText;
  connection: Pick<ProviderInput, "protocol" | "baseUrl" | "auth" | "compatibility">;
  /** 获取该连接产品凭据的官方页面。 */
  keyUrl?: string;
  /** 支撑端点、鉴权与兼容配置的官方资料及核对日期。 */
  sources: readonly [string, ...string[]];
  verifiedOn: string;
  keywords?: readonly string[];
}

/** 草稿只取连接字段并深复制兼容参数；预设身份和资料不进入持久配置。 */
export function providerPresetDraft(preset: ProviderPreset, occupiedIds: readonly string[] = []): ProviderDraft {
  let id = preset.id;
  for (let suffix = 2; occupiedIds.includes(id); suffix++) id = `${preset.id}-${suffix}`;
  return { id, name: preset.name, ...structuredClone(preset.connection) };
}

/** 目录与手动连接共用配置校验，避免新增预设带入未知兼容包或非法参数。 */
export function defineProviderPresets(presets: readonly ProviderPreset[]): readonly ProviderPreset[] {
  const ids = new Set<string>();
  for (const preset of presets) {
    if (ids.has(preset.id)) throw new Error(`Duplicate provider preset: ${preset.id}`);
    ids.add(preset.id);
    providerInputSchema.parse({ ...providerPresetDraft(preset), enabled: true });
  }
  return presets;
}

export const providerPresets = defineProviderPresets([
  {
    id: "openai", name: "OpenAI", group: "official", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://platform.openai.com/api-keys",
    sources: ["https://developers.openai.com/api/docs/guides/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["gpt", "chatgpt"],
  },
  {
    id: "anthropic", name: "Anthropic", group: "official", billing: "usage",
    connection: { protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://platform.claude.com/settings/keys",
    sources: ["https://platform.claude.com/docs/en/api/overview", "https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows"],
    verifiedOn: "2026-10-14", keywords: ["claude"],
  },
  {
    id: "deepseek", name: "DeepSeek", group: "official", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.deepseek.com", auth: "api_key", compatibility: [{ id: "thinkingInDeepSeekFormat" }] },
    keyUrl: "https://platform.deepseek.com/api_keys",
    sources: ["https://api-docs.deepseek.com/guides/responses_api"],
    verifiedOn: "2026-10-14", keywords: ["深度求索"],
  },
  {
    id: "xai", name: "xAI", group: "official", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.x.ai/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://console.x.ai/team/default/api-keys",
    sources: ["https://docs.x.ai/developers/rest-api-reference/inference/responses", "https://docs.x.ai/developers/model-capabilities/text/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["grok"],
  },
]);

export const presetGroups = ["official", "aggregator", "local"] as const satisfies readonly ProviderPreset["group"][];
