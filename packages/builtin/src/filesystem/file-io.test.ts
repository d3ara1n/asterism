import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readViewerFile } from "./file-io.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(contents?: string | Buffer) {
  const root = mkdtempSync(join(tmpdir(), "asterism-file-view-"));
  roots.push(root);
  const file = join(root, "file");
  if (contents !== undefined) writeFileSync(file, contents);
  return { root, file, signal: new AbortController().signal };
}

it.each([
  ["PDF", Buffer.from("%PDF-1.7\n")],
  ["binary", Buffer.from([0, 255, 128, 1])],
] as const)("returns an unavailable preview for %s instead of turning a format mismatch into an I/O failure", async (_, bytes) => {
  const f = fixture(bytes);
  expect(await readViewerFile(f.file, f.signal)).toEqual({ kind: "unsupported", reason: "format", size: bytes.length });
});

it("keeps an oversized text file available for external opening without loading it into the editor", async () => {
  const f = fixture(Buffer.alloc(8 * 1024 * 1024 + 1, 65));
  expect(await readViewerFile(f.file, f.signal)).toEqual({ kind: "unsupported", reason: "size", size: 8 * 1024 * 1024 + 1 });
});

it("recognizes a directory before attempting to read its contents as a file", async () => {
  const f = fixture();
  expect(await readViewerFile(f.root, f.signal)).toEqual({ kind: "directory" });
});

it("still rejects missing files rather than reporting an unsupported format", async () => {
  const f = fixture();
  await expect(readViewerFile(f.file, f.signal)).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves text and image preview routing regardless of the filename extension", async () => {
  const text = fixture("你好\n");
  expect((await readViewerFile(text.file, text.signal)).kind).toBe("text");
  const image = fixture(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=", "base64"));
  expect((await readViewerFile(image.file, image.signal)).kind).toBe("image");
});
