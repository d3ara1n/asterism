import { APICallError, generateText } from "ai";
import { createProviderModel, ProviderTransportError } from "../model/provider.ts";
import { requestOptions } from "../model/request-options.ts";
import type { ModelProvider, ProviderModel, TestError } from "../shared/configuration.ts";
import { applicationUserAgent } from "../shared/application.ts";

export interface ProbeInput { provider: ModelProvider; model: ProviderModel; apiKey: string; signal: AbortSignal }
export type ConnectionProbe = (input: ProbeInput) => Promise<void>;

/** Explicit protocol instances, without Gateway or environment models/credentials. Unauthenticated connections remove auth headers. */
export async function runConnectionProbe(input: ProbeInput, transport: typeof fetch = fetch): Promise<void> {
  const { provider, model, apiKey, signal } = input;
  const languageModel = createProviderModel(provider, model, apiKey, transport, { userAgent: applicationUserAgent });
  await generateText({
    model: languageModel, prompt: "Reply with OK.", abortSignal: signal,
    ...requestOptions(provider, model, { purpose: "probe" }),
  });
}

/** Raw provider error bodies and request details may contain credentials; return only fixed categories and copy. */
export function classifyProbeError(error: unknown): { error: TestError; message: string } {
  if (error instanceof ProviderTransportError) return { error: "configuration", message: error.message };
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
