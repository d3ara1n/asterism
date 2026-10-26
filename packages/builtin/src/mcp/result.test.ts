import { describe, expect, it } from "vitest";
import type { ContentScope } from "@asterism/sdk/runtime";
import { convertMcpResult, mcpResultToModel } from "./result.ts";

const identity = { serverId: "server", serverName: "Server", toolName: "read" };
describe("MCP 结果适配", () => {
  // 工具图片的 base64 不能作为模型文字或历史大字段保存，必须导入宿主内容。
  it("混合内容保持顺序，图片保存为字节引用，资源链接不触发读取", async () => {
    const bytes: Uint8Array[] = [];
    const file = { "$asterism.content": "00000000-0000-4000-8000-000000000001" };
    const content: ContentScope = {
      stage: async source => { if (!(source instanceof Uint8Array)) throw new Error("Unexpected stream"); bytes.push(source); return file; },
      read: async () => { throw new Error("Unexpected content read"); }, open: async function* () { throw new Error("Unexpected content read"); },
    };
    const result = await convertMcpResult({ content: [
      { type: "text", text: "An image" }, { type: "image", data: "AQID", mimeType: "image/png" },
      { type: "resource_link", uri: "example://report", name: "Report" },
    ] }, content);
    expect([...bytes[0]!]).toEqual([1, 2, 3]);
    expect(result.parts).toEqual([{ kind: "text", text: "An image" }, { kind: "file", file, mediaType: "image/png" },
      { kind: "text", text: '{"type":"resource_link","uri":"example://report","name":"Report"}' }]);
  });
  // MCP 可同时交付结构化值与其 JSON 文字副本；模型应只接收一份。
  it("去掉结构化结果的重复展开，同时保留独立说明和原始值", () => {
    expect(mcpResultToModel({ ...identity, parts: [{ kind: "text", text: '{ "count": 2 }' }], structuredContent: { count: 2 } })).toEqual([{ kind: "text", text: '{ "count": 2 }' }]);
    expect(mcpResultToModel({ ...identity, parts: [{ kind: "text", text: "Found two items" }], structuredContent: { count: 2 } })).toEqual([{ kind: "text", text: "Found two items" }, { kind: "text", text: '{"count":2}' }]);
    expect(mcpResultToModel({ ...identity, parts: [], structuredContent: false })).toEqual([{ kind: "text", text: "false" }]);
  });
});
