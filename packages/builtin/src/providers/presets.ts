import { defineMessages, type LanguageModelProviderPreset, type LanguageModelProviderConnection } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const presetMessages = builtin.messages("en", defineMessages({
  mainlandChina: { id: "providerPreset.mainlandChina", defaultMessage: "Mainland China" },
  international: { id: "providerPreset.international", defaultMessage: "International" },
}));

/** Official entry points fix connection details; the editor consumes only rules and does not recognize preset identities. */
const fixedFields: NonNullable<LanguageModelProviderConnection["fixedFields"]> = ["protocol", "baseUrl", "auth", "compatibility", "usage"];

/** Zhipu and Z.ai use the same Responses adapter; region selects only the address, while billing products retain separate credential guidance. */
const zaiResponses = (baseUrl: string): LanguageModelProviderPreset["connection"] => ({
  protocol: "openai-responses", baseUrl, auth: "api_key", fixedFields,
  compatibility: [{ id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false } }],
});

function miniMaxPreset(mainland: boolean, billing: "usage" | "subscription"): LanguageModelProviderPreset {
  const domain = mainland ? "minimax.cn" : "minimax.io";
  const platform = `https://platform.${domain}`;
  const subscription = billing === "subscription";
  return {
    id: `minimax${subscription ? "-plan" : ""}${mainland ? "-cn" : ""}`,
    name: "MiniMax", iconId: "minimax", billing, region: mainland ? presetMessages.mainlandChina : presetMessages.international,
    ...(subscription && { plan: "M Plan" }),
    connection: { fixedFields, protocol: "openai-responses", baseUrl: `https://api.${domain}/v1`, auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }],
      ...(subscription && { usage: "minimax-plan" }) },
    keyUrl: `${platform}/user-center/${subscription ? "payment/token-plan" : "basic-information/interface-key"}`,
    sources: [`${platform}/docs/api-reference/responses-create`, `${platform}/docs/${subscription ? "m-plan/faq" : "api-reference/api-overview"}`],
    verifiedOn: "2026-11-26", keywords: ["minimax", "稀宇", ...(subscription ? ["token plan", "coding plan"] : [])],
  };
}

/** Billing entries share inference endpoints and the key-selected account usage implementation. */
function commandCodePreset(id: string, billing: "usage" | "subscription", protocol: "openai-responses" | "anthropic"): LanguageModelProviderPreset {
  return {
    id, name: "Command Code", iconId: "commandcode", billing,
    connection: { fixedFields, protocol, baseUrl: "https://api.commandcode.ai/provider/v1", auth: "api_key", compatibility: [], usage: "commandcode" },
    keyUrl: "https://commandcode.ai/settings/keys",
    sources: ["https://commandcode.ai/docs/provider", "https://commandcode.ai/docs/plans/goat", "https://commandcode.ai/docs/resources/usage-limits"],
    verifiedOn: "2026-11-12", keywords: ["commandcode", "goat", "pro", "max", "coding", "provider"],
  };
}

export const languageModelProviderPresets: readonly LanguageModelProviderPreset[] = [
  {
    id: "openai", name: "OpenAI", iconId: "openai", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key", compatibility: [], usage: "openai" },
    keyUrl: "https://platform.openai.com/api-keys",
    sources: ["https://developers.openai.com/api/docs/guides/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["gpt", "chatgpt"],
  },
  {
    id: "anthropic", name: "Anthropic", iconId: "anthropic", billing: "usage",
    connection: { fixedFields, protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "api_key", compatibility: [{ id: "messagesPromptCaching" }], usage: "anthropic" },
    keyUrl: "https://platform.claude.com/settings/keys",
    sources: ["https://platform.claude.com/docs/en/api/overview", "https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows"],
    verifiedOn: "2026-10-14", keywords: ["claude"],
  },
  {
    id: "deepseek", name: "DeepSeek", iconId: "deepseek", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.deepseek.com", auth: "api_key", compatibility: [], usage: "deepseek" },
    keyUrl: "https://platform.deepseek.com/api_keys",
    sources: ["https://api-docs.deepseek.com/guides/responses_api"],
    verifiedOn: "2026-10-14", keywords: ["深度求索"],
  },
  {
    id: "xai", name: "xAI", iconId: "xai", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.x.ai/v1", auth: "api_key", compatibility: [], usage: "xai" },
    keyUrl: "https://console.x.ai/team/default/api-keys",
    sources: ["https://docs.x.ai/developers/rest-api-reference/inference/responses", "https://docs.x.ai/developers/model-capabilities/text/reasoning"],
    verifiedOn: "2026-10-14", keywords: ["grok"],
  },
  {
    id: "openrouter", name: "OpenRouter", iconId: "openrouter", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://openrouter.ai/api/v1", auth: "api_key", compatibility: [], usage: "openrouter" },
    keyUrl: "https://openrouter.ai/settings/keys",
    sources: ["https://openrouter.ai/docs/api/reference/responses/overview", "https://openrouter.ai/docs/api/api-reference/responses/create-a-response"],
    verifiedOn: "2026-10-15", keywords: ["router", "aggregator"],
  },
  {
    id: "zenmux", name: "ZenMux", iconId: "zenmux", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://zenmux.ai/api/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://zenmux.ai/platform/pay-as-you-go",
    sources: ["https://zenmux.ai/docs/guide/quickstart.html", "https://zenmux.ai/docs/api/openai/openai-responses.html"],
    verifiedOn: "2026-11-26", keywords: ["zenmux", "zen mux", "aggregator"],
  },
  {
    id: "kilo-gateway", name: "Kilo Gateway", iconId: "kilocode", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://ai-gateway.kilo.ai/api/v1", auth: "api_key",
      compatibility: [{ id: "responsesOmitStoredItems" }], usage: "kilo-gateway" },
    keyUrl: "https://app.kilo.ai/profile",
    sources: ["https://kilo.ai/docs/gateway/authentication", "https://github.com/Kilo-Org/kilocode/tree/main/packages/kilo-gateway/src"],
    verifiedOn: "2026-11-26", keywords: ["kilo code", "kilocode", "aggregator"],
  },
  {
    id: "mistral", name: "Mistral", iconId: "mistral", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.mistral.ai/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false, requireInputSummary: true } }] },
    keyUrl: "https://console.mistral.ai/api-keys",
    sources: ["https://docs.mistral.ai/inference/conversations/responses", "https://docs.mistral.ai/api/endpoint/responses"],
    verifiedOn: "2026-11-26", keywords: ["mistral ai", "codestral", "devstral", "studio"],
  },
  {
    id: "together", name: "Together AI", iconId: "together", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.together.ai/v1", auth: "api_key",
      compatibility: [
        { id: "responsesReasoning", value: { encryptedContent: false, summary: false } },
        { id: "customThinkingLevels", value: { max: "xhigh" } },
      ] },
    keyUrl: "https://api.together.ai/settings/projects/~current/api-keys",
    sources: ["https://docs.together.ai/docs/inference/responses-api"],
    verifiedOn: "2026-11-04", keywords: ["togetherai", "aggregator", "glm"],
  },
  {
    id: "fireworks", name: "Fireworks AI", iconId: "fireworks", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.fireworks.ai/inference/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://app.fireworks.ai/settings/users/api-keys",
    sources: ["https://docs.fireworks.ai/guides/response-api"],
    verifiedOn: "2026-11-04", keywords: ["fireworksai", "aggregator"],
  },
  {
    id: "huggingface", name: "Hugging Face", iconId: "huggingface", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://router.huggingface.co/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://huggingface.co/settings/tokens",
    sources: ["https://huggingface.co/docs/inference-providers/en/guides/responses-api"],
    verifiedOn: "2026-11-04", keywords: ["hf", "inference providers", "aggregator"],
  },
  {
    id: "opencode", name: "OpenCode Console", iconId: "opencode", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://opencode.ai/inference/v1", auth: "api_key", compatibility: [] },
    keyUrl: "https://opencode.ai/console",
    sources: ["https://opencode.ai/docs/zen/", "https://opencode.ai/v2/docs/console/api/inference/"],
    verifiedOn: "2026-10-15", keywords: ["opencode", "zen", "console"],
  },
  {
    id: "opencode-plan", name: "OpenCode Go", iconId: "opencode", billing: "subscription",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://opencode.ai/inference/go/v1", auth: "api_key", usage: "opencode-plan",
      compatibility: [{ id: "opencodeSession" }] },
    keyUrl: "https://opencode.ai/console",
    sources: ["https://opencode.ai/docs/go/"],
    verifiedOn: "2026-10-15", keywords: ["opencode", "go", "go plus", "console"],
  },
  commandCodePreset("commandcode", "usage", "openai-responses"),
  commandCodePreset("commandcode-anthropic", "usage", "anthropic"),
  commandCodePreset("commandcode-plan", "subscription", "openai-responses"),
  commandCodePreset("commandcode-plan-anthropic", "subscription", "anthropic"),
  {
    id: "charm-hyper", name: "Charm Hyper", iconId: "charm-hyper", billing: "usage",
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://hyper.charm.land/v1", auth: "api_key", compatibility: [], usage: "charm-hyper" },
    keyUrl: "https://hyper.charm.land/app/api-keys",
    sources: ["https://hyper.charm.land/docs/coding-agents/codex.md", "https://hyper.charm.land/docs/api/credits.md"],
    verifiedOn: "2026-11-26", keywords: ["hyper", "charmbracelet", "crush", "prism"],
  },
  miniMaxPreset(true, "usage"),
  miniMaxPreset(false, "usage"),
  miniMaxPreset(true, "subscription"),
  miniMaxPreset(false, "subscription"),
  {
    id: "kimi-cn", name: "Kimi", iconId: "kimi", billing: "usage", region: presetMessages.mainlandChina,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.moonshot.cn/v1", auth: "api_key", usage: "kimi-cn",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.com/console/api-keys",
    sources: ["https://platform.kimi.com/docs/api/overview", "https://platform.kimi.com/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi", name: "Kimi", iconId: "kimi", billing: "usage", region: presetMessages.international,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.moonshot.ai/v1", auth: "api_key", usage: "kimi",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://platform.kimi.ai/console/api-keys",
    sources: ["https://platform.kimi.ai/docs/api/overview", "https://platform.kimi.ai/docs/api/responses"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面"],
  },
  {
    id: "kimi-plan-cn", name: "Kimi Code", iconId: "kimi", billing: "subscription", region: presetMessages.mainlandChina,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.kimi.com/coding/v1", auth: "api_key", usage: "kimi-plan-cn",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://www.kimi.com/code/console",
    sources: ["https://www.kimi.com/code/docs/third-party-tools/codex.html", "https://www.kimi.com/code/docs/kimi-code/community-guidelines.html"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面", "coding"],
  },
  {
    id: "kimi-plan", name: "Kimi Code", iconId: "kimi", billing: "subscription", region: presetMessages.international,
    connection: { fixedFields, protocol: "openai-responses", baseUrl: "https://api.kimi.ai/coding/v1", auth: "api_key", usage: "kimi-plan",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }] },
    keyUrl: "https://www.kimi.com/code/console",
    sources: ["https://www.kimi.com/code/docs/en/third-party-tools/codex.html", "https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html"],
    verifiedOn: "2026-10-15", keywords: ["moonshot", "月之暗面", "coding"],
  },
  {
    id: "zai-cn", name: "Zhipu AI", iconId: "zai", billing: "usage", region: presetMessages.mainlandChina,
    connection: zaiResponses("https://open.bigmodel.cn/api/v1"),
    keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    sources: ["https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["z.ai", "zai", "glm", "bigmodel", "智谱"],
  },
  {
    id: "zai", name: "Z.ai", iconId: "zai", billing: "usage", region: presetMessages.international,
    connection: zaiResponses("https://api.z.ai/api/v1"),
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    sources: ["https://docs.z.ai/guides/llm/glm-5.3", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["zai", "glm", "zhipu", "智谱"],
  },
  {
    id: "zai-plan-cn", name: "Zhipu AI", iconId: "zai", billing: "subscription", region: presetMessages.mainlandChina,
    connection: { ...zaiResponses("https://open.bigmodel.cn/api/v1"), usage: "zai-plan-cn" },
    keyUrl: "https://bigmodel.cn/coding-plan/personal/overview",
    sources: ["https://docs.bigmodel.cn/cn/coding-plan/tool/codex", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["z.ai", "zai", "glm", "bigmodel", "智谱"],
  },
  {
    id: "zai-plan", name: "Z.ai", iconId: "zai", billing: "subscription", region: presetMessages.international,
    connection: { ...zaiResponses("https://api.z.ai/api/v1"), usage: "zai-plan" },
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    sources: ["https://docs.z.ai/devpack/tool/codex", "https://docs.z.ai/devpack/usage-policy", "https://docs.bigmodel.cn/api-reference/response/创建-response"],
    verifiedOn: "2026-10-15", keywords: ["zai", "glm", "zhipu", "智谱"],
  },
];
