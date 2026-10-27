import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { createAnthropic } from "@ai-sdk/anthropic";
import { ModelFailure } from "./contract.ts";

type MessagesModel = ReturnType<ReturnType<typeof createAnthropic>["messages"]>;
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
type Step = { kind: "thinking"; value: Record<string, unknown> } | { kind: "text"; text: string } | { kind: "tool"; id: string };
type Group = { role: "user" | "assistant"; steps: Step[] };
function fail(): never { throw new ModelFailure("protocol_encoding", "The Messages encoder cannot preserve the requested thinking order."); }

/** Signatures, redacted data, and unsigned plaintext are all Messages reasoning inputs; separate summaries are not disguised as thinking. */
function prepare(options: CallOptions) {
  if (!options.prompt.some(message => message.role === "assistant" && message.content.some(part => part.type === "reasoning"))) return null;
  const groups: Group[] = [];
  const prompt = options.prompt.map(message => {
    if (message.role === "system") return message;
    const role = message.role === "assistant" ? "assistant" : "user";
    let group = groups.at(-1);
    if (group?.role !== role) { group = { role, steps: [] }; groups.push(group); }
    if (message.role !== "assistant") return message;
    const content = message.content.filter(part => {
      if (part.type === "reasoning") {
        const native = part.providerOptions?.anthropic;
        if (typeof native?.redactedData === "string") group.steps.push({ kind: "thinking", value: { type: "redacted_thinking", data: native.redactedData } });
        else if (part.text || typeof native?.signature === "string") group.steps.push({ kind: "thinking", value: {
          type: "thinking", thinking: part.text,
          ...(typeof native?.signature === "string" ? { signature: native.signature } : {}),
        } });
        return false;
      }
      if (part.type === "text") group.steps.push({ kind: "text", text: part.text });
      else if (part.type === "tool-call") group.steps.push({ kind: "tool", id: part.toolCallId });
      else fail();
      return true;
    });
    // Preserve grouping boundaries for empty assistants; restore reasoning-only messages after serialization.
    return { ...message, content };
  });
  return { prompt, groups };
}

function insert(body: unknown, groups: Group[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail();
  const request = body as Record<string, unknown>;
  if (!Array.isArray(request.messages)) fail();
  const messages: unknown[] = [];
  let index = 0;
  for (const group of groups) {
    const ordinary = group.steps.filter(step => step.kind !== "thinking");
    const onlyThinking = group.role === "assistant" && ordinary.length === 0;
    const message = onlyThinking ? { role: "assistant", content: [] } : request.messages[index++];
    if (!message || typeof message !== "object" || message.role !== group.role || !Array.isArray(message.content)) fail();
    if (group.role === "user") { messages.push(message); continue; }
    const remaining = [...message.content] as Record<string, unknown>[];
    const content = group.steps.map(step => {
      if (step.kind === "thinking") return step.value;
      // The SDK moves tool_use to the block end and trims the last assistant's final text segment; signed reasoning is not trimmed.
      const trimmedLastText = group === groups.at(-1) && step === ordinary.at(-1);
      const position = remaining.findIndex(part => step.kind === "tool"
        ? part.type === "tool_use" && part.id === step.id
        : part.type === "text" && (part.text === step.text || (trimmedLastText && part.text === step.text.trim())));
      if (position < 0) fail();
      return remaining.splice(position, 1)[0];
    });
    if (remaining.length) fail();
    if (content.length) messages.push({ ...message, content });
  }
  if (index !== request.messages.length) fail();
  return { ...request, messages };
}

export function withAnthropicThinking(createModel: (transport: typeof fetch) => MessagesModel, transport: typeof fetch) {
  const model = createModel(transport);
  const project = (options: CallOptions) => {
    const plan = prepare(options);
    if (!plan) return null;
    const fetch: typeof transport = (url, init) => {
      if (typeof init?.body !== "string") fail();
      return transport(url, { ...init, body: JSON.stringify(insert(JSON.parse(init.body), plan.groups)) });
    };
    return { model: createModel(fetch), options: { ...options, prompt: plan.prompt } };
  };
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapStream: async ({ params, doStream }) => {
      const value = project(params);
      return value ? value.model.doStream(value.options) : doStream();
    },
    wrapGenerate: async ({ params, doGenerate }) => {
      const value = project(params);
      return value ? value.model.doGenerate(value.options) : doGenerate();
    },
  } });
}
