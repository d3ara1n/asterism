import { createAnthropic } from "@ai-sdk/anthropic";
import type { ThinkingLevel } from "@asterism-app/sdk/contracts";
import { compatibility, thinkingMappings, type ThinkingMappings } from "../compatibility.ts";
import { mappedEffort, setEffort, withRequestEncoding, type Body } from "../request-encoding.ts";
import { namespaced, pickNative, type ModelProtocol, type ProviderOptions } from "./contract.ts";
import { withAnthropicThinking } from "./anthropic-thinking.ts";
import { anthropicUsage } from "./anthropic-usage.ts";
import { inlineBase64, projectInlineFiles } from "./inline-file-projection.ts";

const projectFiles = (prompt: Parameters<typeof projectInlineFiles>[0]) => {
  const document: Parameters<typeof projectInlineFiles>[1] = part => {
    if (part.mediaType.startsWith("image/") || part.mediaType === "application/pdf") return;
    return { type: "document", source: { type: "base64", media_type: part.mediaType, data: inlineBase64(part.data.data) }, title: part.filename };
  };
  return projectInlineFiles(prompt, (part, index) => part.mediaType === "text/plain" ? undefined : document(part, index), document);
};

type ActiveLevel = Exclude<ThinkingLevel, "off">;
const nativeKeys = ["signature", "redactedData"] as const;

/** Default manual budgets use the total output limit with a 1024-token floor; explicit overrides are sent unchanged. */
const budgetRatios: Record<ActiveLevel, number> = {
  minimal: 0.02, low: 0.1, medium: 0.3, high: 0.6, xhigh: 0.9, max: 0.95,
};
const defaultManualOutputTokens = 4096;

/** Explicit levels use adaptive thinking unless the budget pack selects manual thinking, independent of model IDs. */
function encodeRequest(body: Body, level: ThinkingLevel | null, maxOutputTokens: number | undefined, mappings: ThinkingMappings, manual: boolean) {
  if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens;
  if (level === null) return;
  const customEffort = mappings.levels[level];
  if (level === "off") {
    // Unsupported endpoints reject explicit off rather than silently substituting another mode.
    body.thinking = { type: "disabled" };
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  if (manual) {
    const limit = maxOutputTokens ?? defaultManualOutputTokens;
    const budget = mappings.budgets[level] ?? Math.max(1024, Math.floor(limit * budgetRatios[level]));
    body.thinking = { type: "enabled", budget_tokens: budget };
    // The output cap includes thinking; budgets do not add a hidden allowance.
    body.max_tokens = limit;
    // Manual budgets do not require effort; attach it only with explicit mappings for endpoints supporting both.
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  body.thinking = { type: "adaptive", display: "summarized" };
  // Messages has no minimal effort; the nearest supported value is low.
  setEffort(body, "output_config", mappedEffort(level, mappings, { minimal: "low" }));
}

export const anthropicMessages: ModelProtocol = {
  id: "anthropic",
  continuationFormat: "anthropic/1",
  sdkReasoning: true,
  toolResultFiles: () => "content",
  createModel(target, connection) {
    const mappings = thinkingMappings(target);
    const manual = compatibility(target).has("customThinkingBudgets");
    return withRequestEncoding(
      transport => withAnthropicThinking(fetch => createAnthropic({ ...connection, fetch }).messages(target.model.modelId), transport),
      connection.fetch,
      (body, level, maxOutputTokens) => encodeRequest(body, level, maxOutputTokens, mappings, manual),
      { forwardReasoning: false, projectPrompt: projectFiles },
    );
  },
  callOptions(target, request) {
    if (request.purpose === "probe") return { providerOptions: {} };
    // The SDK writes a top-level marker; the service chooses the breakpoint and TTL.
    const providerOptions: ProviderOptions = compatibility(target).has("messagesPromptCaching")
      ? { anthropic: { cacheControl: { type: "ephemeral" } } } : {};
    return { system: request.system, providerOptions };
  },
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
