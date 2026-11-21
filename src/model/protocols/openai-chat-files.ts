import { ModelFailure } from "../contract.ts";
import { requestObject, type Body, type RequestPrompt } from "../request-encoding.ts";
import { inlineBase64, projectInlineFiles } from "./inline-file-projection.ts";

type ToolMessage = Extract<RequestPrompt[number], { role: "tool" }>;
type ToolResult = Extract<ToolMessage["content"][number], { type: "tool-result" }>;
type Part = Extract<ToolResult["output"], { type: "content" }>["value"][number];

const audioTypes = ["audio/wav", "audio/mp3", "audio/mpeg"];
function genericFilePart(base64: string, mediaType: string, filename: string) {
  return { type: "file", file: { filename, file_data: `data:${mediaType};base64,${base64}` } };
}

function filePart(part: Extract<Part, { type: "file" }>, index: number) {
  // Asterism projects resolved tool files as inline data, regardless of the original resource.
  if (part.data.type !== "data") throw new ModelFailure("protocol_encoding", "Expected inline data for a Chat Completions tool attachment.");
  const base64 = inlineBase64(part.data.data);
  const dataUrl = `data:${part.mediaType};base64,${base64}`;
  if (part.mediaType.startsWith("image/")) return { type: "image_url", image_url: { url: dataUrl } };
  if (audioTypes.includes(part.mediaType))
    return { type: "input_audio", input_audio: { data: base64, format: part.mediaType === "audio/wav" ? "wav" : "mp3" } };
  return genericFilePart(base64, part.mediaType, part.filename ?? `part-${index}`);
}

/** Keep structured attachment parts in the tool message on the wire instead of letting the SDK stringify them as text. */
function projectChatToolFiles(prompt: RequestPrompt) {
  const results: { id: string; parts?: Part[] }[] = [];
  let hasFiles = false;
  const sdkPrompt = prompt.map(message => message.role !== "tool" ? message : {
    ...message, content: message.content.map(part => {
      if (part.type !== "tool-result") return part;
      const output = part.output;
      if (output.type !== "content" || !output.value.some(value => value.type === "file")) {
        results.push({ id: part.toolCallId });
        return part;
      }
      hasFiles = true;
      results.push({ id: part.toolCallId, parts: output.value });
      return { ...part, output: { type: "text" as const, value: "" } };
    }),
  });
  if (!hasFiles) return null;
  return { prompt: sdkPrompt, encode(body: Body) {
    const fail = () => { throw new ModelFailure("protocol_encoding", "The Chat Completions encoder did not preserve tool result pairing."); };
    if (!Array.isArray(body.messages)) return fail();
    let index = 0;
    for (const value of body.messages) {
      const message = requestObject(value);
      if (message.role !== "tool") continue;
      const result = results[index++];
      if (!result || message.tool_call_id !== result.id) return fail();
      if (result.parts) message.content = result.parts.map((part, index) => part.type === "file" ? filePart(part, index) : part);
    }
    if (index !== results.length) fail();
  } };
}

export function projectChatFiles(prompt: RequestPrompt) {
  const user = projectInlineFiles(prompt, (part, index) => {
    if (part.mediaType.startsWith("image/") || part.mediaType === "application/pdf" || audioTypes.includes(part.mediaType)) return;
    return genericFilePart(inlineBase64(part.data.data), part.mediaType, part.filename ?? `part-${index}`);
  });
  const tool = projectChatToolFiles(user?.prompt ?? prompt);
  if (!user || !tool) return user ?? tool;
  return { prompt: tool.prompt, encode(body: Body) { user.encode(body); tool.encode(body); } };
}
