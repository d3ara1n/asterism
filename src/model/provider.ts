import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelRequestIdentity } from "@atelier/sdk/contracts";
import type { ProviderInput, ProviderModel } from "../shared/configuration.ts";
import { ModelFailure } from "./contract.ts";
import { unauthenticatedApiKey } from "../shared/model.ts";
import { compatibilityForTarget } from "./projection.ts";
import { withResponsesReasoning } from "./responses-reasoning.ts";
import { withAnthropicThinking } from "./anthropic-thinking.ts";
import { modelRequestHeaders } from "./request-identity.ts";
import { withThinkingOptions } from "./thinking-options.ts";

export class ProviderTransportError extends ModelFailure {
  constructor() { super("configuration", "API key connections require HTTPS, except on loopback addresses."); }
}
export function validateProviderTransport(provider: ProviderInput): void {
  const endpoint = new URL(provider.baseUrl);
  const loopback = ["localhost", "[::1]", "::1"].includes(endpoint.hostname) || /^127(?:\.\d{1,3}){3}$/.test(endpoint.hostname);
  if (provider.auth === "api_key" && endpoint.protocol !== "https:" && !loopback) throw new ProviderTransportError();
}
/** 连接测试与真实执行共用传输边界；不回退环境凭据，不自动跟随重定向。 */
export function createProviderModel(provider: ProviderInput, model: ProviderModel, key: string, transport: typeof fetch = fetch, identity: ModelRequestIdentity = {}) {
  validateProviderTransport(provider);
  const identityHeaders = modelRequestHeaders({ provider, model }, identity);
  const scopedFetch: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    // 最终发送边界覆盖 SDK 自动生成或追加的 UA，保持调用方／兼容包声明的原值。
    identityHeaders.forEach((value, name) => headers.set(name, value));
    if (provider.auth === "none") { headers.delete("authorization"); headers.delete("x-api-key"); }
    return transport(url, { ...init, headers, redirect: "error" });
  };
  const options = { baseURL: provider.baseUrl, apiKey: provider.auth === "none" ? unauthenticatedApiKey : key, fetch: scopedFetch };
  const createModel = (transport: typeof fetch) => {
    if (provider.protocol === "anthropic") return withAnthropicThinking(
      fetch => createAnthropic({ ...options, fetch }).messages(model.modelId), transport);
    if (provider.protocol === "openai-chat") return createOpenAI({ ...options, fetch: transport }).chat(model.modelId);
    const responses = (fetch: typeof transport) => createOpenAI({ ...options, fetch }).responses(model.modelId);
    return withResponsesReasoning(responses, transport, compatibilityForTarget({ provider, model }));
  };
  return withThinkingOptions(createModel, scopedFetch, provider, model);
}
