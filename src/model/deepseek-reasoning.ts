import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { createOpenAI } from "@ai-sdk/openai";
import { ModelFailure } from "./contract.ts";

type ResponsesModel = ReturnType<ReturnType<typeof createOpenAI>["responses"]>;
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
type InputStep =
  | { kind: "thinking"; text: string }
  | { kind: "message"; role: "system" | "user" | "assistant"; text?: string }
  | { kind: "call" | "result"; callId: string };

function encodingFailure(): never {
  throw new ModelFailure("protocol_encoding", "The Responses encoder cannot preserve the requested plain-text reasoning order.");
}

/** 在 SDK 编码前固定顺序；原生文件、工具和普通消息仍交给 SDK 编码。 */
function prepare(options: CallOptions): { prompt: CallOptions["prompt"]; steps: InputStep[] } | null {
  if (!options.prompt.some(message => message.role === "assistant" && message.content.some(part => part.type === "reasoning"))) return null;
  const openai = options.providerOptions?.openai;
  if (openai?.store !== false || openai.conversation != null || openai.previousResponseId != null) encodingFailure();
  const steps: InputStep[] = [];
  const prompt: CallOptions["prompt"] = [];
  for (const message of options.prompt) {
    if (message.role === "system" || message.role === "user") {
      steps.push({ kind: "message", role: message.role });
      prompt.push(message);
    } else if (message.role === "assistant") {
      const content = message.content.filter(part => {
        if (part.type === "reasoning") {
          if (part.text) steps.push({ kind: "thinking", text: part.text });
          return false;
        }
        if (part.type === "text") steps.push({ kind: "message", role: "assistant", text: part.text });
        else if (part.type === "tool-call") steps.push({ kind: "call", callId: part.toolCallId });
        else encodingFailure();
        return true;
      });
      if (content.length) prompt.push({ ...message, content });
    } else {
      for (const part of message.content) {
        if (part.type !== "tool-result") encodingFailure();
        steps.push({ kind: "result", callId: part.toolCallId });
      }
      prompt.push(message);
    }
  }
  return { prompt, steps };
}

/** SDK 已序列化的输入必须与计划逐项对应；升级造成形状变化时明确失败，不猜测位置。 */
function insertThinking(body: unknown, steps: readonly InputStep[]): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) encodingFailure();
  const request = body as Record<string, unknown>;
  if (!Array.isArray(request.input)) encodingFailure();
  const input: unknown[] = [];
  let index = 0;
  for (const step of steps) {
    if (step.kind === "thinking") {
      input.push({ type: "reasoning", content: [{ type: "reasoning_text", text: step.text }] });
      continue;
    }
    const item: unknown = request.input[index++];
    if (!item || typeof item !== "object" || Array.isArray(item)) encodingFailure();
    const encoded = item as Record<string, unknown>;
    if (step.kind === "message") {
      if (encoded.role !== step.role || (encoded.type !== undefined && encoded.type !== "message")) encodingFailure();
      if (step.text !== undefined && encoded.content !== step.text) encodingFailure();
    } else if (encoded.type !== (step.kind === "call" ? "function_call" : "function_call_output") || encoded.call_id !== step.callId) {
      encodingFailure();
    }
    input.push(item);
  }
  if (index !== request.input.length) encodingFailure();
  return { ...request, input };
}

/** 只补充 DeepSeek 明文 reasoning 输入；每次调用独立捕获计划，不修改 SDK 或历史。 */
export function withDeepSeekReasoning(createModel: (transport: typeof fetch) => ResponsesModel, transport: typeof fetch) {
  const model = createModel(transport);
  const project = (options: CallOptions) => {
    const plan = prepare(options);
    if (!plan) return null;
    const projectedFetch: typeof fetch = (url, init) => {
      if (typeof init?.body !== "string") encodingFailure();
      const body = JSON.stringify(insertThinking(JSON.parse(init.body), plan.steps));
      return transport(url, { ...init, body });
    };
    return { model: createModel(projectedFetch), options: { ...options, prompt: plan.prompt } };
  };
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapStream: async ({ params, doStream }) => {
      const projected = project(params);
      return projected ? projected.model.doStream(projected.options) : doStream();
    },
    wrapGenerate: async ({ params, doGenerate }) => {
      const projected = project(params);
      return projected ? projected.model.doGenerate(projected.options) : doGenerate();
    },
  } });
}
