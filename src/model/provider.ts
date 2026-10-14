import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderInput, ProviderModel } from "../shared/configuration.ts";
import { ModelFailure } from "./contract.ts";
import { unauthenticatedApiKey } from "../shared/model.ts";
import { compatibilityForTarget } from "./projection.ts";
import { withDeepSeekReasoning } from "./deepseek-reasoning.ts";

export class ProviderTransportError extends ModelFailure {
  constructor() { super("configuration", "API key connections require HTTPS, except on loopback addresses."); }
}
export function validateProviderTransport(provider: ProviderInput): void {
  const endpoint = new URL(provider.baseUrl);
  const loopback = ["localhost", "[::1]", "::1"].includes(endpoint.hostname) || /^127(?:\.\d{1,3}){3}$/.test(endpoint.hostname);
  if (provider.auth === "api_key" && endpoint.protocol !== "https:" && !loopback) throw new ProviderTransportError();
}
/** 连接测试与真实执行共用传输边界；不回退环境凭据，不自动跟随重定向。 */
export function createProviderModel(provider: ProviderInput, model: ProviderModel, key: string, transport: typeof fetch = fetch) {
  validateProviderTransport(provider);
  const scopedFetch: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    if (provider.auth === "none") { headers.delete("authorization"); headers.delete("x-api-key"); }
    return transport(url, { ...init, headers, redirect: "error" });
  };
  const options = { baseURL: provider.baseUrl, apiKey: provider.auth === "none" ? unauthenticatedApiKey : key, fetch: scopedFetch };
  if (provider.protocol === "anthropic") return createAnthropic(options).messages(model.modelId);
  if (provider.protocol === "openai-chat") return createOpenAI(options).chat(model.modelId);
  const responses = (fetch: typeof scopedFetch) => createOpenAI({ ...options, fetch }).responses(model.modelId);
  return compatibilityForTarget({ provider, model }).plainThinking
    ? withDeepSeekReasoning(responses, scopedFetch) : responses(scopedFetch);
}
