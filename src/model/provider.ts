import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelRequestIdentity } from "@asterism/sdk/contracts";
import type { ModelProviderInput, ProviderModel } from "../shared/configuration.ts";
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
export function validateProviderTransport(provider: ModelProviderInput): void {
  const endpoint = new URL(provider.baseUrl);
  const loopback = ["localhost", "[::1]", "::1"].includes(endpoint.hostname) || /^127(?:\.\d{1,3}){3}$/.test(endpoint.hostname);
  if (provider.auth === "api_key" && endpoint.protocol !== "https:" && !loopback) throw new ProviderTransportError();
}
/** Connection tests and real execution share a transport boundary without environment credential fallback or automatic redirects. */
export function createProviderModel(provider: ModelProviderInput, model: ProviderModel, key: string, transport: typeof fetch = fetch, identity: ModelRequestIdentity = {}) {
  validateProviderTransport(provider);
  const identityHeaders = modelRequestHeaders({ provider, model }, identity);
  const scopedFetch: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    // Override SDK-generated or appended UAs at final transmission to preserve the caller/compatibility package's declared value.
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
