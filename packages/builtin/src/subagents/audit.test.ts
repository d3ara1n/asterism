import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ContentRef, ModelRunEvent } from "@asterism-app/sdk/contracts";
import { saveAudit } from "./audit.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// Only delivered tool output grants an audit dependency; repeated references share one retained copy.
it("copies delivered attachments once while preserving rejected argument references only as text", async () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-subagent-audit-")); roots.push(root);
  const file: ContentRef = { "$asterism.content": "00000000-0000-4000-8000-000000000001" };
  const invalid: ContentRef = { "$asterism.content": "00000000-0000-4000-8000-000000000002" };
  const bytes = new TextEncoder().encode("Retained bytes"), reads: ContentRef[] = [];
  const event: ModelRunEvent = { type: "block", block: {
    responseId: "response", requestParentId: null, ordinal: 0, complete: true, continuation: null,
    source: { model: "test/model", adapter: "test", scope: "test" },
    kind: "toolcall", callId: "call", name: "file", argumentsText: null, arguments: { unknown: invalid },
    outcome: { kind: "succeeded", data: { file }, model: [{ kind: "file", file, mediaType: "application/octet-stream" }] },
  } };
  await saveAudit(root, "run", [{ type: "execution", event }], {
    async read() { throw new Error("Audit transfer should stream the content."); },
    async *open(ref) { reads.push(ref); yield bytes; },
  });
  expect(reads).toEqual([file]);
  expect(readFileSync(join(root, "run", file["$asterism.content"]))).toEqual(Buffer.from(bytes));
  expect(JSON.parse(readFileSync(join(root, "run.jsonl"), "utf8")).event.block.arguments).toEqual({ unknown: invalid });
});
