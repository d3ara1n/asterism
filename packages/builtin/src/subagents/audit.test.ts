import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ContentRef, ModelRunEvent } from "@asterism-app/sdk/contracts";
import { AuditLog } from "./audit.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const directory = () => { const root = mkdtempSync(join(tmpdir(), "asterism-subagent-audit-")); roots.push(root); return root; };

// Only delivered tool output grants an audit dependency; repeated references share one retained copy.
it("copies delivered attachments once while preserving rejected argument references only as text", async () => {
  const root = directory();
  const file: ContentRef = { "$asterism.content": "00000000-0000-4000-8000-000000000001" };
  const invalid: ContentRef = { "$asterism.content": "00000000-0000-4000-8000-000000000002" };
  const bytes = new TextEncoder().encode("Retained bytes"), reads: ContentRef[] = [];
  const event: ModelRunEvent = { type: "block", block: {
    responseId: "response", requestParentId: null, ordinal: 0, complete: true, continuation: null,
    source: { model: "test/model", adapter: "test", scope: "test" },
    kind: "toolcall", callId: "call", name: "file", argumentsText: null, arguments: { unknown: invalid },
    outcome: { kind: "succeeded", data: { file }, model: [{ kind: "file", file, mediaType: "application/octet-stream" }] },
  } };
  const audit = new AuditLog(root, "run");
  audit.start({
    async read() { throw new Error("Audit transfer should stream the content."); },
    async *open(ref: ContentRef) { reads.push(ref); yield bytes; },
  });
  audit.append({ type: "execution", event });
  audit.append({ type: "execution", event });
  await audit.close();
  expect(reads).toEqual([file]);
  expect(readFileSync(join(root, "run", file["$asterism.content"]))).toEqual(Buffer.from(bytes));
  const lines = readFileSync(join(root, "run.jsonl"), "utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  expect(lines).toHaveLength(2);
  expect(lines[0].event.block.arguments).toEqual({ unknown: invalid });
});

// Entries recorded before execution are buffered as values; later mutation of the source must not change the record.
it("writes nothing for an unstarted run and snapshots buffered entries when they are appended", async () => {
  const root = directory(), messages = ["first"];
  const unstarted = new AuditLog(root, "queued");
  unstarted.append({ type: "steering-delivered", messages });
  await unstarted.close();
  expect(existsSync(join(root, "queued.jsonl"))).toBe(false);
  const audit = new AuditLog(root, "run");
  audit.append({ type: "steering-delivered", messages });
  messages.push("later");
  audit.start({ async read() { throw new Error("unused"); }, async *open() {} });
  await audit.close();
  expect(JSON.parse(readFileSync(join(root, "run.jsonl"), "utf8"))).toEqual({ type: "steering-delivered", messages: ["first"] });
});
