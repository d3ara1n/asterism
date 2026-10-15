import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { createOpenAI } from "@ai-sdk/openai";
import { ModelFailure } from "./contract.ts";

type ResponsesModel = ReturnType<ReturnType<typeof createOpenAI>["responses"]>;
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
type InputStep =
  | { kind: "thinking"; item: Record<string, unknown> }
  | { kind: "message"; role: "system" | "user" | "assistant"; text?: string }
  | { kind: "call" | "result"; callId: string };

function encodingFailure(): never {
  throw new ModelFailure("protocol_encoding", "The Responses encoder cannot preserve the requested plain-text reasoning order.");
}

/** 在 SDK 编码前固定顺序；原生文件、工具和普通消息仍交给 SDK 编码。 */
function prepare(options: CallOptions, contentShape: "array" | "object"): { prompt: CallOptions["prompt"]; steps: InputStep[] } | null {
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
          const native = part.providerOptions?.openai;
          const summary = part.providerOptions?.atelier?.summary;
          const encrypted = native?.reasoningEncryptedContent;
          const item: Record<string, unknown> = { type: "reasoning" };
          if (typeof encrypted === "string") {
            item.encrypted_content = encrypted;
            if (typeof native?.itemId === "string") item.id = native.itemId;
            item.summary = typeof summary === "string" && summary ? [{ type: "summary_text", text: summary }] : [];
          } else {
            if (part.text) {
              const content = { type: "reasoning_text", text: part.text };
              item.content = contentShape === "object" ? content : [content];
            }
            if (typeof summary === "string" && summary) item.summary = [{ type: "summary_text", text: summary }];
          }
          if (Object.keys(item).length > 1) steps.push({ kind: "thinking", item });
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
      input.push(step.item);
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

/** 公共思考的原生编码；兼容配置仅改变字段形状与参数，不决定明文是否参与请求。 */
export function withResponsesReasoning(createModel: (transport: typeof fetch) => ResponsesModel, transport: typeof fetch,
  fields: { reasoningContent: "array" | "object"; encryptedContent: boolean; reasoningSummary: boolean }) {
  // SDK 会自行加入密文 include 和默认摘要，须在最终请求边界应用端点字段约定。
  const wireFetch: typeof fetch = (url, init) => {
    if (fields.encryptedContent && fields.reasoningSummary) return transport(url, init);
    if (typeof init?.body !== "string") encodingFailure();
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (!fields.encryptedContent && Array.isArray(body.include)) {
      const include = body.include.filter(field => field !== "reasoning.encrypted_content");
      if (include.length) body.include = include;
      else delete body.include;
    }
    if (!fields.reasoningSummary && body.reasoning && typeof body.reasoning === "object")
      delete (body.reasoning as Record<string, unknown>).summary;
    return transport(url, { ...init, body: JSON.stringify(body) });
  };
  const model = createModel(wireFetch);
  const project = (options: CallOptions) => {
    const plan = prepare(options, fields.reasoningContent);
    if (!plan) return null;
    const projectedFetch: typeof fetch = (url, init) => {
      if (typeof init?.body !== "string") encodingFailure();
      const body = JSON.stringify(insertThinking(JSON.parse(init.body), plan.steps));
      return wireFetch(url, { ...init, body });
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
