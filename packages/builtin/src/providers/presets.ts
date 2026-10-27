import { defineMessages, type ModelProviderPreset, type ModelProviderConnection } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const presetMessages = builtin.messages("en", defineMessages({
  mainlandChina: { id: "providerPreset.mainlandChina", defaultMessage: "Mainland China" },
  international: { id: "providerPreset.international", defaultMessage: "International" },
  coding: { id: "providerPreset.coding", defaultMessage: "Coding plan · Supported clients only" },
}));

/** Official entry points fix connection details; the editor consumes only rules and does not recognize preset identities. */
const fixedFields: NonNullable<ModelProviderConnection["fixedFields"]> = ["protocol", "baseUrl", "auth", "compatibility", "usage"];

/** Zhipu and Z.ai use the same Responses adapter; region selects only the address, while billing products retain separate credential guidance. */
const zaiResponses = (baseUrl: string): ModelProviderPreset["connection"] => ({
  protocol: "openai-responses", baseUrl, auth: "api_key", fixedFields,
  compatibility: [{ id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false } }],
});

export const modelProviderPresets: readonly ModelProviderPreset[] = [
  {
    id: "openai", name: "OpenAI", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key", compatibility: [], usage: "openai" },
    keyUrl: "https://platform.openai.com/api-keys",
    sources: ["https://developers.openai.com/api/docs/guides/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["gpt", "chatgpt"],
  },
  {
    id: "anthropic", name: "Anthropic", billing: "usage",
    connection: { fixedFields, protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "api_key", compatibility: [], usage: "anthropic" },
    keyUrl: "https://platform.claude.com/settings/keys",
    sources: ["https://platform.claude.com/docs/en/api/overview", "https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows"],
    verifiedOn: "2026-10-14", keywords: ["claude"],
  },
  {
    id: "deepseek", name: "DeepSeek", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.deepseek.com", auth: "api_key", compatibility: [], usage: "deepseek" },
    keyUrl: "https://platform.deepseek.com/api_keys",
    sources: ["https://api-docs.deepseek.com/guides/responses_api"],
    verifiedOn: "2026-10-14", keywords: ["深度求索"],
  },
  {
    id: "xai", name: "xAI", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.x.ai/v1", auth: "api_key", compatibility: [], usage: "xai" },
    keyUrl: "https://console.x.ai/team/default/api-keys",
    sources: ["https://docs.x.ai/developers/rest-api-reference/inference/responses", "https://docs.x.ai/developers/model-capabilities/text/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["grok"],
  },
  {
    id: "openrouter", name: "OpenRouter", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://openrouter.ai/api/v1", auth: "api_key", compatibility: [], usage: "openrouter" },
    keyUrl: "https://openrouter.ai/settings/keys",
    sources: ["https://openrouter.ai/docs/api/reference/responses/overview", "https://openrouter.ai/docs/api/api-reference/responses/create-a-response"],
    verifiedOn: "2026-10-15", keywords: ["router", "aggregator"],
  },
  {
    id: "opencode", name: "OpenCode Console", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://opencode.ai/inference/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://opencode.ai/console",
    sources: ["https://opencode.ai/docs/zen/", "https://opencode.ai/v2/docs/console/api/inference/"],
    verifiedOn: "2026-10-15", keywords: ["opencode", "zen", "console"],
  },
  {
    id: "opencode-plan", name: "OpenCode Go", billing: "subscription",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://opencode.ai/inference/go/v1", auth: "api_key", usage: "opencode-plan",
      compatibility: [{ id: "opencodeSession" }] },
    keyUrl: "https://opencode.ai/console",
    sources: ["https://opencode.ai/docs/go/"],
    verifiedOn: "2026-10-15", keywords: ["opencode", "go", "go plus", "console"],
  },
  {
    id: "kimi-cn", name: "Kimi", billing: "usage", region: presetMessages.mainlandChina,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.moonshot.cn/v1", auth: "api_key", usage: "kimi-cn",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.com/console/api-keys",
    sources: ["https://platform.kimi.com/docs/api/overview", "https://platform.kimi.com/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi", name: "Kimi", billing: "usage", region: presetMessages.international,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.moonshot.ai/v1", auth: "api_key", usage: "kimi",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.ai/console/api-keys",
    sources: ["https://platform.kimi.ai/docs/api/overview", "https://platform.kimi.ai/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi-plan-cn", name: "Kimi Code", billing: "subscription", region: presetMessages.mainlandChina, plan: presetMessages.coding,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.kimi.com/coding/v1", auth: "api_key", usage: "kimi-plan-cn",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://www.kimi.com/code/console",
    sources: ["https://www.kimi.com/code/docs/third-party-tools/codex.html", "https://www.kimi.com/code/docs/kimi-code/community-guidelines.html"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面", "coding"],
  },
  {
    id: "kimi-plan", name: "Kimi Code", billing: "subscription", region: presetMessages.international, plan: presetMessages.coding,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.kimi.ai/coding/v1", auth: "api_key", usage: "kimi-plan",
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
    id: "zai-plan-cn", name: "Zhipu AI", billing: "subscription", region: presetMessages.mainlandChina, plan: presetMessages.coding,
    connection: { ...zaiResponses("https://open.bigmodel.cn/api/v1"), usage: "zai-plan-cn" },
    keyUrl: "https://bigmodel.cn/coding-plan/personal/overview",
    sources: ["https://docs.bigmodel.cn/cn/coding-plan/tool/codex", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["z.ai", "zai", "glm", "bigmodel", "智谱"],
  },
  {
    id: "zai-plan", name: "Z.ai", billing: "subscription", region: presetMessages.international, plan: presetMessages.coding,
    connection: { ...zaiResponses("https://api.z.ai/api/v1"), usage: "zai-plan" },
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    sources: ["https://docs.z.ai/devpack/tool/codex", "https://docs.z.ai/devpack/usage-policy", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["zai", "glm", "zhipu", "智谱"],
  },
];
