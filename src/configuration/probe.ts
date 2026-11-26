import type { ModelCredential } from "@asterism-app/sdk/contracts";
import { APICallError, generateText, streamText } from "ai";
import { createProviderModel, ProviderTransportError } from "../model/provider.ts";
import { requestOptions } from "../model/request-options.ts";
import type { ModelProvider, ProviderModel, TestError } from "../shared/configuration.ts";
import { applicationUserAgent } from "../shared/application.ts";

export interface ProbeInput { provider: ModelProvider; model: ProviderModel; credential: ModelCredential; signal: AbortSignal }
export type ConnectionProbe = (input: ProbeInput) => Promise<void>;

/** Explicit protocol instances, without Gateway or environment models/credentials. Unauthenticated connections remove auth headers. */
export async function runConnectionProbe(input: ProbeInput, transport: typeof fetch = fetch): Promise<void> {
  const { provider, model, credential, signal } = input;
  const languageModel = createProviderModel(provider, model, credential, transport, { userAgent: applicationUserAgent });
  const options = { model: languageModel, prompt: "Reply with OK.", abortSignal: signal,
    ...requestOptions(provider, model, { purpose: "probe" }),
  };
  if (credential.kind !== "oauth" || provider.protocol !== "openai-responses") { await generateText(options); return; }
  // A subscription request must stream; a stream ending after text alone does not verify inference.
  const stream = streamText({ ...options, include: { rawChunks: true }, onError: () => {} });
  let completed = false;
  for await (const part of stream.fullStream) {
    if (part.type === "error") throw part.error;
    if (part.type === "raw" && (part.rawValue as { type?: string } | null)?.type === "response.completed") completed = true;
  }
  if (!completed) throw Object.assign(new Error("Inference did not complete."), { name: "AI_InvalidResponseDataError" });
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
