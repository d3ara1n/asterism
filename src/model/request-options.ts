import type { ModelProviderInput, ProviderModel, ThinkingLevel } from "../shared/configuration.ts";
import { ModelFailure } from "./contract.ts";
import { modelProtocol } from "./protocols/index.ts";
import type { ProviderOptions } from "./protocols/contract.ts";

type Connection = Pick<ModelProviderInput, "protocol" | "compatibility">;
type RequestPurpose = { purpose: "probe" } | { purpose: "execution"; thinking: ThinkingLevel | null; system?: string; maxOutputTokens?: number };
interface RequestOptions {
  maxRetries: 0;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoning?: Exclude<ThinkingLevel, "off"> | "none";
  providerOptions: ProviderOptions;
}

/** Sole request-option interpretation entry for connection tests and execution; probes verify basic protocol connectivity only. */
export function requestOptions(provider: Connection, model: ProviderModel, request: RequestPurpose): RequestOptions {
  const protocol = modelProtocol(provider.protocol);
  const target = { provider, model };
  const options: RequestOptions = {
    maxRetries: 0,
    maxOutputTokens: model.generation.maxOutputTokens ?? undefined,
    temperature: model.generation.temperature ?? undefined,
    topP: model.generation.topP ?? undefined,
    providerOptions: {},
  };
  if (request.purpose === "probe") return { ...options, ...protocol.callOptions(target, request) };
  if (request.maxOutputTokens !== undefined) {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
      throw new ModelFailure("invalid_argument", "The output token limit must be a positive safe integer.");
    options.maxOutputTokens = Math.min(options.maxOutputTokens ?? Infinity, request.maxOutputTokens);
  }
  // Level sets serve selectors only; inherited explicit levels encode by protocol and upstream decides acceptance.
  if (model.capabilities.reasoning && request.thinking !== null)
    options.reasoning = request.thinking === "off" ? "none" : request.thinking;
  return { ...options, ...protocol.callOptions(target, { purpose: "execution", system: request.system, reasoning: options.reasoning }) };
}
