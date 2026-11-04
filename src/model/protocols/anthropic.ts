import { createAnthropic } from "@ai-sdk/anthropic";
import type { ThinkingLevel } from "@asterism-app/sdk/contracts";
import { ModelFailure } from "../contract.ts";
import { thinkingMappings, type ThinkingMappings } from "../compatibility.ts";
import { mappedEffort, requestObject, setEffort, withThinkingEncoding, type Body } from "../thinking-options.ts";
import { namespaced, pickNative, type ModelProtocol, type ProviderOptions } from "./contract.ts";
import { withAnthropicThinking } from "./anthropic-thinking.ts";
import { anthropicUsage } from "./anthropic-usage.ts";

type ActiveLevel = Exclude<ThinkingLevel, "off">;
const nativeKeys = ["signature", "redactedData"] as const;

/** Allocate manual budgets against the final total output limit, with a minimum of 1024; explicit overrides are always absolute token counts. */
const budgetRatios: Record<ActiveLevel, number> = {
  minimal: 0.02, low: 0.1, medium: 0.3, high: 0.6, xhigh: 0.9, max: 0.95,
};
const defaultManualOutputTokens = 4096;

/** The SDK still identifies Anthropic model reasoning modes; Asterism owns effort and manual-budget mappings. */
function encodeThinking(body: Body, level: ThinkingLevel, maxOutputTokens: number | undefined, mappings: ThinkingMappings) {
  const customEffort = mappings.levels[level];
  if (level === "off") {
    // Do not accept SDK replacement of off with low effort or between_tools; unsupported endpoints reject it themselves.
    body.thinking = { type: "disabled" };
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  const thinking = body.thinking === undefined ? undefined : requestObject(body.thinking);
  if (thinking?.type === "enabled") {
    // Do not infer limits from max_tokens after the SDK adds budgets; the host fixes defaults too.
    const limit = maxOutputTokens ?? defaultManualOutputTokens;
    const budget = mappings.budgets[level] ?? Math.max(1024, Math.floor(limit * budgetRatios[level]));
    if (!Number.isSafeInteger(budget) || budget < 1024 || budget >= limit)
      throw new ModelFailure("thinking_budget_unavailable", "The thinking budget must be at least 1024 tokens and smaller than the output token limit. Adjust the budget or output limit.");
    body.thinking = { ...thinking, budget_tokens: budget };
    // The SDK adds reasoning budgets to max_tokens; Asterism's limit includes reasoning and must not expand.
    body.max_tokens = limit;
    // Manual budgets do not require effort; attach it only with explicit mappings for endpoints supporting both.
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  if (thinking !== undefined && thinking.type !== "adaptive" && thinking.type !== "between_tools")
    throw new ModelFailure("protocol_encoding", "The Messages encoder returned an unsupported thinking mode.");
  // Messages has no minimal effort; the nearest supported value is low.
  setEffort(body, "output_config", mappedEffort(level, mappings, { minimal: "low" }));
  if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens;
}

export const anthropicMessages: ModelProtocol = {
  id: "anthropic",
  continuationFormat: "anthropic/1",
  sdkReasoning: true,
  toolResultFiles: () => "content",
  createModel(target, connection) {
    const mappings = thinkingMappings(target);
    return withThinkingEncoding(
      transport => withAnthropicThinking(fetch => createAnthropic({ ...connection, fetch }).messages(target.model.modelId), transport),
      connection.fetch,
      (body, level, maxOutputTokens) => encodeThinking(body, level, maxOutputTokens, mappings),
    );
  },
  callOptions: (_target, request) => ({
    ...(request.purpose === "execution" ? { system: request.system } : {}),
    providerOptions: {},
  }),
  capture: metadata => pickNative(namespaced(metadata, "anthropic"), nativeKeys),
  restore: value => pickNative(value, nativeKeys),
  replay: (_part, native): ProviderOptions => Object.keys(native).length ? { anthropic: native } : {},
  // Signatures, redacted data, and unsigned plaintext are Messages reasoning input; separate summaries are not disguised as thinking.
  replaysThinking: (part, native) => Boolean(part.text || typeof native.signature === "string" || typeof native.redactedData === "string"),
  meter() {
    const anthropic = anthropicUsage();
    return {
      observe(part, usage) {
        if (part.type === "custom" && part.kind === "anthropic.message_start")
          return anthropic.observe(usage, part.providerMetadata?.anthropic?.usage, false);
        if (part.type === "raw" && part.rawValue && typeof part.rawValue === "object") {
          const raw = part.rawValue as Record<string, unknown>;
          if (raw.type === "message_delta") return anthropic.observe(usage, raw.usage, true);
        }
        return usage;
      },
    };
  },
  discoveryHeaders(auth, apiKey) {
    const headers = new Headers({ accept: "application/json", "anthropic-version": "2023-06-01" });
    if (auth === "api_key") headers.set("x-api-key", apiKey);
    return headers;
  },
};
