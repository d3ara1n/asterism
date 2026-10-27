import { describe, expect, it } from "vitest";
import type { ContentScope } from "@asterism-app/sdk/runtime";
import { convertMcpResult, mcpResultToModel } from "./result.ts";

const identity = { serverId: "server", serverName: "Server", toolName: "read" };
describe("MCP result adaptation", () => {
  // Tool image base64 must not be saved as model text or large history fields; import it into host content.
  it("preserves mixed-content order, saves images as byte references, and does not read resource links", async () => {
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
  // MCP can deliver both a structured value and its JSON text duplicate; the model should receive only one copy.
  it("removes duplicate expansion of structured results while preserving independent explanations and original values", () => {
    expect(mcpResultToModel({ ...identity, parts: [{ kind: "text", text: '{ "count": 2 }' }], structuredContent: { count: 2 } })).toEqual([{ kind: "text", text: '{ "count": 2 }' }]);
    expect(mcpResultToModel({ ...identity, parts: [{ kind: "text", text: "Found two items" }], structuredContent: { count: 2 } })).toEqual([{ kind: "text", text: "Found two items" }, { kind: "text", text: '{"count":2}' }]);
    expect(mcpResultToModel({ ...identity, parts: [], structuredContent: false })).toEqual([{ kind: "text", text: "false" }]);
  });
});
