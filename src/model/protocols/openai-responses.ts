import { createOpenAI } from "@ai-sdk/openai";
import { ModelFailure, type ModelEvent } from "../contract.ts";
import { compatibility, thinkingMappings, type CompatibilityTarget } from "../compatibility.ts";
import { mappedEffort, setEffort, withRequestEncoding } from "../request-encoding.ts";
import { bearerHeaders, namespaced, pickNative, type ModelProtocol, type ProviderOptions } from "./contract.ts";
import { withResponsesReasoning } from "./responses-reasoning.ts";

const nativeKeys = ["itemId", "reasoningEncryptedContent", "phase"] as const;

/** Endpoint field conventions declared by compatibility packs; defaults follow the OpenAI Responses API. */
function responsesFields(target: CompatibilityTarget) {
  const entries = compatibility(target);
  const reasoning = entries.value<{ content?: "array" | "object"; encryptedContent?: boolean; summary?: boolean }>("responsesReasoning") ?? {};
  return {
    systemMessage: entries.has("systemMessageInMessages"),
    reasoningContent: reasoning.content ?? "array",
    encryptedContent: reasoning.encryptedContent ?? true,
    reasoningSummary: reasoning.summary ?? true,
  };
}

/** Responses delivers full reasoning text and summaries as separate raw events per reasoning item; SDK reasoning parts merge them. */
function decoder() {
  const items = new Map<number, { partId: string; itemId: string; summaryIndex: number | null; hasSummary: boolean }>();
  return function* decode(raw: Record<string, unknown>): Iterable<ModelEvent> {
    if (raw.type === "response.output_item.added" || raw.type === "response.output_item.done") {
      const item = raw.item as Record<string, unknown> | undefined;
      if (item?.type !== "reasoning") return;
      if (typeof item.id !== "string" || !Number.isInteger(raw.output_index) || (raw.output_index as number) < 0)
        throw new ModelFailure("protocol", "The provider returned an invalid reasoning item.");
      const index = raw.output_index as number;
      if (raw.type === "response.output_item.added") {
        if (items.has(index)) throw new ModelFailure("protocol", "The provider started a duplicate reasoning item.");
        const partId = `thinking:${item.id}`;
        items.set(index, { partId, itemId: item.id, summaryIndex: null, hasSummary: false });
        yield { type: "part.start", part: { id: partId, kind: "thinking" } };
      } else {
        const thinking = items.get(index);
        if (!thinking) throw new ModelFailure("protocol", "The provider ended an inactive reasoning item.");
        const continuation = pickNative({
          itemId: thinking.itemId,
          ...(typeof item.encrypted_content === "string" ? { reasoningEncryptedContent: item.encrypted_content } : {}),
        }, nativeKeys);
        yield { type: "part.end", partId: thinking.partId, continuation };
        items.delete(index);
      }
      return;
    }
    const summary = raw.type === "response.reasoning_summary_text.delta";
    if (!summary && raw.type !== "response.reasoning_text.delta") return;
    if (typeof raw.item_id !== "string" || typeof raw.delta !== "string" || !Number.isInteger(raw.output_index))
      throw new ModelFailure("protocol", "The provider returned an invalid reasoning delta.");
    const thinking = items.get(raw.output_index as number);
    if (!thinking) throw new ModelFailure("protocol", "The provider updated an inactive reasoning item.");
    if (summary) {
      const index = typeof raw.summary_index === "number" ? raw.summary_index : 0;
      if (thinking.hasSummary && thinking.summaryIndex !== index)
        yield { type: "part.delta", partId: thinking.partId, delta: "\n\n", channel: "summary" };
      thinking.summaryIndex = index;
      thinking.hasSummary ||= raw.delta.length > 0;
    }
    yield { type: "part.delta", partId: thinking.partId, delta: raw.delta, ...(summary ? { channel: "summary" as const } : {}) };
  };
}

export const openaiResponses: ModelProtocol = {
  id: "openai-responses",
  continuationFormat: "openai-responses/1",
  sdkReasoning: false,
  toolResultFiles: () => "content",
  createModel(target, connection) {
    const fields = responsesFields(target);
    const mappings = thinkingMappings(target);
    const responses = (fetch: typeof connection.fetch) => createOpenAI({ ...connection, fetch }).responses(target.model.modelId);
    return withRequestEncoding(
      transport => withResponsesReasoning(responses, transport, fields),
      connection.fetch,
      (body, level) => { if (level !== null) setEffort(body, "reasoning", mappedEffort(level, mappings)); },
    );
  },
  callOptions(target, request) {
    if (request.purpose === "probe") return { providerOptions: { openai: { store: false } } };
    const fields = responsesFields(target);
    const reasoning = target.model.capabilities.reasoning;
    return {
      ...(fields.systemMessage ? { system: request.system } : {}),
      providerOptions: { openai: {
        // Explicit false matters too: otherwise the SDK automatically requests encrypted reasoning by model name.
        store: false, forceReasoning: reasoning,
        ...(reasoning && fields.encryptedContent ? { include: ["reasoning.encrypted_content"] } : {}),
        ...(reasoning && fields.reasoningSummary ? { reasoningSummary: "auto" } : {}),
        ...(fields.systemMessage ? { systemMessageMode: "system" }
          : request.system !== undefined ? { instructions: request.system } : {}),
        ...(request.reasoning ? { reasoningEffort: request.reasoning } : {}),
      } },
    };
  },
  capture: metadata => pickNative(namespaced(metadata, "openai"), nativeKeys),
  restore: value => pickNative(value, nativeKeys),
  replay(part, native) {
    const options: ProviderOptions = Object.keys(native).length ? { openai: native } : {};
    // The reasoning encoder pairs summaries with encrypted items; summaries are never sent as reasoning text.
    if (part.kind === "thinking") options.asterism = { summary: part.summary };
    return options;
  },
  replaysThinking: (part, native) => Boolean(part.text || part.summary || typeof native.reasoningEncryptedContent === "string"),
  decoder,
  failureEvent: raw => raw.type === "response.failed",
  meter: () => ({
    observe(part, usage, thinking) {
      if (part.type === "raw" && part.rawValue && typeof part.rawValue === "object") {
        const raw = part.rawValue as Record<string, unknown>;
        if ((raw.type === "response.reasoning_text.delta" || raw.type === "response.reasoning_summary_text.delta") && typeof raw.delta === "string")
          thinking(raw.delta);
      }
      return usage;
    },
  }),
  discoveryHeaders: bearerHeaders,
};
