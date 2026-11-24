import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ModelFilePart, ModelItem } from "@asterism-app/sdk/contracts";
import { createAttachmentProjection } from "./attachments.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "asterism-attachment-test-"));
  directories.push(root);
  return createAttachmentProjection(root);
}
const file = (number: number, mediaType: string, filename: string): ModelFilePart => ({
  kind: "file", file: { "$asterism.content": `00000000-0000-4000-8000-${String(number).padStart(12, "0")}` }, mediaType, filename,
});

it("streams unsupported and oversized uploads to stable local paths while keeping enabled PDF media inline", async () => {
  const project = await setup(), signal = new AbortController().signal;
  const pdf = file(1, "application/pdf", "small.pdf");
  const xlsx = file(2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sheet.xlsx");
  const large = file(3, "application/pdf", "large.pdf");
  const sizes = [3, 4, (8 * 1024 * 1024) + 1];
  const read = vi.fn(async () => { throw new Error("the whole-file reader should not be called"); });
  const size = (ref: ModelFilePart["file"]) => sizes[Number(ref["$asterism.content"].at(-1)) - 1]!;
  const open = vi.fn(async function* (ref: ModelFilePart["file"]) {
    for (let remaining = size(ref); remaining > 0; remaining -= 64 * 1024) yield Buffer.alloc(Math.min(remaining, 64 * 1024), 42);
  });
  const original: ModelItem[] = [{ kind: "input", parts: [pdf, xlsx, large] }];
  const [item] = await project(original, "s1", { read, size, open }, ["pdf"], signal);
  expect(item?.kind).toBe("input");
  if (item?.kind !== "input") throw new Error("Expected input");
  expect(item.parts[0]).toEqual(pdf);
  for (const [index, part] of item.parts.slice(1).entries()) {
    if (part.kind !== "text") throw new Error("Expected local path, not binary attachment");
    const envelope = JSON.parse(part.text.slice("<attachment>".length, -"</attachment>".length));
    const bytes = await readFile(envelope.path);
    expect({ filename: envelope.filename, size: bytes.length, firstByte: bytes[0] }).toEqual({ filename: ["sheet.xlsx", "large.pdf"][index], size: sizes[index + 1], firstByte: 42 });
  }
  expect(await project(original, "s1", { read, size, open }, ["pdf"], signal)).toEqual([item]);
  expect(open).toHaveBeenCalledTimes(2);
  expect(read).not.toHaveBeenCalled();
  expect(original[0]).toEqual({ kind: "input", parts: [pdf, xlsx, large] });
});

it("keeps a saved see result available to a vision model but does not export or send it after switching to text-only", async () => {
  const project = await setup(), signal = new AbortController().signal;
  const image = file(1, "image/gif", "diagram.gif");
  const result = { kind: "result", callId: "see-1", name: "see",
    outcome: { kind: "succeeded", data: null, model: [image] } } satisfies ModelItem;
  const size = vi.fn(() => 10);
  const open = vi.fn(async function* () { throw new Error("the image should not be opened during projection"); });
  const content = { size, open, read: async () => new Uint8Array() };
  expect(await project([result], "s1", content, ["image"], signal)).toEqual([result]);
  size.mockClear();
  expect(await project([result], "s1", content, [], signal)).toMatchObject([{ kind: "result", callId: "see-1", outcome: {
    model: [{ kind: "text", text: expect.stringContaining("not configured for this tool result format") }],
  } }]);
  expect(size).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
