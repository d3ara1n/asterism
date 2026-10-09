import type { ProviderInput } from "./configuration.ts";

/**
 * 提供商预设：仅在新建连接时填入默认值，存储不记录预设身份。
 * 新增厂商只需追加一项；界面按 group 分组、按数量决定是否显示分组标题与搜索。
 */
export interface ProviderPreset {
  id: string;
  name: string;
  group: "official" | "aggregator" | "local";
  protocol: ProviderInput["protocol"];
  baseUrl: string;
  auth: ProviderInput["auth"];
  /** 获取 API key 的官方页面，经系统浏览器打开。 */
  keyUrl?: string;
  /** 搜索别名。 */
  keywords?: string[];
}

export const providerPresets: readonly ProviderPreset[] = [
  { id: "openai", name: "OpenAI", group: "official", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key",
    keyUrl: "https://platform.openai.com/api-keys", keywords: ["gpt", "chatgpt"] },
  { id: "anthropic", name: "Anthropic", group: "official", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "api_key",
    keyUrl: "https://console.anthropic.com/settings/keys", keywords: ["claude"] },
  { id: "openrouter", name: "OpenRouter", group: "aggregator", protocol: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", auth: "api_key",
    keyUrl: "https://openrouter.ai/keys" },
  { id: "ollama", name: "Ollama", group: "local", protocol: "openai-chat", baseUrl: "http://localhost:11434/v1", auth: "none", keywords: ["local", "本地"] },
];

export const presetGroups = ["official", "aggregator", "local"] as const satisfies readonly ProviderPreset["group"][];
