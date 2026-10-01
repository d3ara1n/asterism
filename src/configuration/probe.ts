import { APICallError, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Provider, ProviderModel, TestError } from "../shared/configuration.ts";

export interface ProbeInput { provider: Provider; model: ProviderModel; apiKey: string; signal: AbortSignal }
export type ConnectionProbe = (input: ProbeInput) => Promise<void>;
class ProbeConfigurationError extends Error {}

/** 显式协议实例，不使用 Gateway 或环境变量中的模型/凭据。无鉴权连接删除鉴权头。 */
export async function runConnectionProbe(input: ProbeInput, transport: typeof fetch = fetch): Promise<void> {
  const { provider, model, apiKey, signal } = input;
  const endpoint = new URL(provider.baseUrl);
  const loopback = ["localhost", "[::1]", "::1"].includes(endpoint.hostname) || /^127(?:\.\d{1,3}){3}$/.test(endpoint.hostname);
  if (provider.auth === "api_key" && endpoint.protocol !== "https:" && !loopback) {
    throw new ProbeConfigurationError("API key connections require HTTPS, except on loopback addresses.");
  }
  const scopedFetch: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    if (provider.auth === "none") { headers.delete("authorization"); headers.delete("x-api-key"); }
    return transport(url, { ...init, headers, redirect: "error" });
  };
  const options = { baseURL: provider.baseUrl, apiKey, fetch: scopedFetch };
  const languageModel = provider.protocol === "anthropic" ? createAnthropic(options).messages(model.modelId)
    : provider.protocol === "openai-chat" ? createOpenAI(options).chat(model.modelId)
    : createOpenAI(options).responses(model.modelId);
  await generateText({
    model: languageModel, prompt: "Reply with OK.", maxRetries: 0, abortSignal: signal,
    maxOutputTokens: Math.min(model.generation.maxOutputTokens ?? 64, 128),
    ...(model.generation.temperature === null ? {} : { temperature: model.generation.temperature }),
    ...(model.generation.topP === null ? {} : { topP: model.generation.topP }),
    ...(provider.protocol === "openai-responses" ? { providerOptions: { openai: { store: false } } } : {}),
  });
}

/** provider 的原始错误正文和请求信息可能含凭据，只返回固定分类与文案。 */
export function classifyProbeError(error: unknown): { error: TestError; message: string } {
  if (error instanceof ProbeConfigurationError) return { error: "configuration", message: error.message };
  if (APICallError.isInstance(error)) {
    const code = error.statusCode;
    if (code === 401 || code === 403) return { error: "authentication", message: "Authentication failed. Check the connection credential." };
    if (code === 404) return { error: "model_unavailable", message: "The endpoint or model was not found." };
    if (code === 429) return { error: "rate_limit", message: "The provider rate limit or quota was reached." };
    if (code && code >= 500) return { error: "server", message: "The provider reported a server error." };
    if (code) return { error: "protocol", message: "The provider rejected this protocol or model configuration." };
  }
  const name = error instanceof Error ? error.name : "";
  if (["AI_TypeValidationError", "AI_InvalidResponseDataError", "AI_NoContentGeneratedError"].includes(name)) {
    return { error: "protocol", message: "The response does not match the selected protocol." };
  }
  return { error: "network", message: "The request could not be completed. Check the endpoint and network connection." };
}
