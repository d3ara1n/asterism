import { jsonSchema, type ModelInputPart } from "@atelier/sdk/contracts";
import type { ContentScope } from "@atelier/sdk/runtime";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { McpCallData } from "./contract.ts";
import { extraStructured } from "./content.ts";

/** MCP 字节进入宿主不可变内容，历史与模型共用相同引用。资源链接保留 URI，不自动读取。 */
export async function convertMcpResult(result: CallToolResult, content: ContentScope): Promise<Pick<McpCallData, "parts" | "structuredContent">> {
  const parts: ModelInputPart[] = [];
  for (const block of result.content ?? []) {
    switch (block.type) {
      case "text": parts.push({ kind: "text", text: block.text }); break;
      case "image": case "audio":
        parts.push({ kind: "file", file: await content.stage(Buffer.from(block.data, "base64")), mediaType: block.mimeType }); break;
      case "resource": {
        const resource = block.resource;
        if ("text" in resource) parts.push({ kind: "text", text: resource.text });
        else parts.push({ kind: "file", file: await content.stage(Buffer.from(resource.blob, "base64")), mediaType: resource.mimeType ?? "application/octet-stream", filename: resource.uri.split("/").at(-1) || "resource" });
        break;
      }
      case "resource_link": parts.push({ kind: "text", text: JSON.stringify({ type: block.type, uri: block.uri, name: block.name, description: block.description }) }); break;
    }
  }
  return { parts, ...(result.structuredContent !== undefined && { structuredContent: jsonSchema.parse(result.structuredContent) }) };
}
export function mcpResultToModel(data: McpCallData): ModelInputPart[] {
  const extra = extraStructured(data);
  return [...data.parts, ...(extra ? [{ kind: "text" as const, text: JSON.stringify(extra.value) }] : [])];
}
