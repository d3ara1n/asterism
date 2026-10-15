import { defineMessages, pluginNamespace, type UiText } from "@atelier/sdk/contracts";
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

const presetMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  mainlandChina: { id: "providerPreset.mainlandChina", defaultMessage: "Mainland China" },
  international: { id: "providerPreset.international", defaultMessage: "International" },
  coding: { id: "providerPreset.coding", defaultMessage: "Coding plan · Supported clients only" },
}));

/** 智谱与 Z.ai 采用同一 Responses 适配；地区只选择地址，计费产品保留独立凭据说明。 */
const zaiResponses = (baseUrl: string): ProviderPreset["connection"] => ({
  protocol: "openai-responses", baseUrl, auth: "api_key",
  compatibility: [{ id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false } }],
});

export const providerPresets = defineProviderPresets([
  {
    id: "openai", name: "OpenAI", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://platform.openai.com/api-keys",
    sources: ["https://developers.openai.com/api/docs/guides/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["gpt", "chatgpt"],
  },
  {
    id: "anthropic", name: "Anthropic", billing: "usage",
    connection: { protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://platform.claude.com/settings/keys",
    sources: ["https://platform.claude.com/docs/en/api/overview", "https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows"],
    verifiedOn: "2026-10-14", keywords: ["claude"],
  },
  {
    id: "deepseek", name: "DeepSeek", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.deepseek.com", auth: "api_key", compatibility: [] },
    keyUrl: "https://platform.deepseek.com/api_keys",
    sources: ["https://api-docs.deepseek.com/guides/responses_api"],
    verifiedOn: "2026-10-14", keywords: ["深度求索"],
  },
  {
    id: "xai", name: "xAI", billing: "usage",
    connection: { protocol: "openai-responses", baseUrl: "https://api.x.ai/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://console.x.ai/team/default/api-keys",
    sources: ["https://docs.x.ai/developers/rest-api-reference/inference/responses", "https://docs.x.ai/developers/model-capabilities/text/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["grok"],
  },
  {
    id: "kimi-cn", name: "Kimi", billing: "usage", region: presetMessages.mainlandChina,
    connection: { protocol: "openai-responses", baseUrl: "https://api.moonshot.cn/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.com/console/api-keys",
    sources: ["https://platform.kimi.com/docs/api/overview", "https://platform.kimi.com/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi", name: "Kimi", billing: "usage", region: presetMessages.international,
    connection: { protocol: "openai-responses", baseUrl: "https://api.moonshot.ai/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.ai/console/api-keys",
    sources: ["https://platform.kimi.ai/docs/api/overview", "https://platform.kimi.ai/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi-code-cn", name: "Kimi Code", billing: "subscription", region: presetMessages.mainlandChina, plan: presetMessages.coding,
    connection: { protocol: "openai-responses", baseUrl: "https://api.kimi.com/coding/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://www.kimi.com/code/console",
    sources: ["https://www.kimi.com/code/docs/third-party-tools/codex.html", "https://www.kimi.com/code/docs/kimi-code/community-guidelines.html"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面", "coding"],
  },
  {
    id: "kimi-code", name: "Kimi Code", billing: "subscription", region: presetMessages.international, plan: presetMessages.coding,
    connection: { protocol: "openai-responses", baseUrl: "https://api.kimi.ai/coding/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://www.kimi.com/code/console",
    sources: ["https://www.kimi.com/code/docs/en/third-party-tools/codex.html", "https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面", "coding"],
  },
  {
    id: "zai-cn", name: "Zhipu AI", billing: "usage", region: presetMessages.mainlandChina,
    connection: zaiResponses("https://open.bigmodel.cn/api/v1"),
    keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    sources: ["https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["z.ai", "zai", "glm", "bigmodel", "智谱"],
  },
  {
    id: "zai", name: "Z.ai", billing: "usage", region: presetMessages.international,
    connection: zaiResponses("https://api.z.ai/api/v1"),
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    sources: ["https://docs.z.ai/guides/llm/glm-5.3", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["zai", "glm", "zhipu", "智谱"],
  },
  {
    id: "zai-coding-cn", name: "Zhipu AI", billing: "subscription", region: presetMessages.mainlandChina, plan: presetMessages.coding,
    connection: zaiResponses("https://open.bigmodel.cn/api/v1"),
    keyUrl: "https://bigmodel.cn/coding-plan/personal/overview",
    sources: ["https://docs.bigmodel.cn/cn/coding-plan/tool/codex", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["z.ai", "zai", "glm", "bigmodel", "智谱"],
  },
  {
    id: "zai-coding", name: "Z.ai", billing: "subscription", region: presetMessages.international, plan: presetMessages.coding,
    connection: zaiResponses("https://api.z.ai/api/v1"),
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    sources: ["https://docs.z.ai/devpack/tool/codex", "https://docs.z.ai/devpack/usage-policy", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["zai", "glm", "zhipu", "智谱"],
  },
]);
