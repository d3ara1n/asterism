import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { ModelFailure } from "../contract.ts";
import { requestObject, type Body, type RequestPrompt } from "../request-encoding.ts";

type UserPart = Extract<RequestPrompt[number], { role: "user" }>["content"][number];
type ToolPart = Extract<RequestPrompt[number], { role: "tool" }>["content"][number];
type ToolContent = Extract<Extract<ToolPart, { type: "tool-result" }>["output"], { type: "content" }>["value"][number];
type File = Extract<UserPart | ToolContent, { type: "file" }>;
type InlineFile = File & { data: Extract<File["data"], { type: "data" }> };
type Encoder = (part: InlineFile, index: number) => Body | undefined;

export function inlineBase64(data: Uint8Array | string) {
  return typeof data === "string" ? data : Buffer.from(data).toString("base64");
}

/** Route inline files past SDK encoders that would reject or drop them. Replace temporary tags before transport. */
export function projectInlineFiles(prompt: RequestPrompt, user: Encoder, tool?: Encoder) {
  const replacements = new Map<string, Body>();
  const project = <Part extends UserPart | ToolContent>(part: Part, index: number, encode: Encoder) => {
    if (part.type !== "file" || part.data.type !== "data") return part;
    const encoded = encode({ ...part, data: part.data }, index);
    if (!encoded) return part;
    const text = `asterism-inline-file:${randomUUID()}`;
    replacements.set(text, encoded);
    return { type: "text" as const, text, providerOptions: part.providerOptions };
  };
  const sdkPrompt = prompt.map(message => {
    if (message.role === "user") return { ...message, content: message.content.map((part, index) => project(part, index, user)) };
    if (message.role !== "tool" || !tool) return message;
    return { ...message, content: message.content.map(part => part.type !== "tool-result" || part.output.type !== "content" ? part : {
      ...part, output: { ...part.output, value: part.output.value.map((value, index) => project(value, index, tool)) },
    }) };
  });
  if (!replacements.size) return null;
  return { prompt: sdkPrompt, encode(body: Body) {
    const matched = new Set<string>();
    const replace = (value: unknown): unknown => {
      const part = requestObject(value);
      if (part.type === "tool_result" && Array.isArray(part.content)) part.content = part.content.map(replace);
      if (part.type !== "text" || typeof part.text !== "string") return part;
      const inserted = replacements.get(part.text);
      if (!inserted) return part;
      matched.add(part.text);
      // Retain cache metadata applied by the SDK to the temporary text part.
      const { type: _type, text: _text, ...metadata } = part;
      return { ...metadata, ...inserted };
    };
    if (Array.isArray(body.messages)) for (const value of body.messages) {
      const message = requestObject(value);
      if (message.role !== "user") continue;
      if (Array.isArray(message.content)) message.content = message.content.map(replace);
      else if (typeof message.content === "string" && replacements.has(message.content)) message.content = [replace({ type: "text", text: message.content })];
    }
    if (matched.size !== replacements.size) throw new ModelFailure("protocol_encoding", "The request encoder did not preserve inline attachment positions.");
  } };
}
