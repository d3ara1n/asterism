import { mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readMetadata } from "./read.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "directory-metadata-"));
  roots.push(root);
  return root;
}
const signal = () => new AbortController().signal;

describe("Directory metadata", () => {
  it("reports byte size rather than character count and serializes modification time in UTC", async () => {
    const root = setup(), file = join(root, "text.txt");
    writeFileSync(file, "你好\n");
    const modified = new Date("2024-01-02T03:04:05.000Z");
    utimesSync(file, modified, modified);
    expect(await readMetadata(root, { path: "text.txt" }, signal())).toEqual({
      kind: "succeeded",
      data: { path: "text.txt", type: "file", size: 7, modifiedAt: "2024-01-02T03:04:05.000Z" },
    });
  });

  it("omits the filesystem's directory byte size even when the directory contains files", async () => {
    const root = setup();
    writeFileSync(join(root, "file.bin"), Buffer.alloc(1024));
    expect(await readMetadata(root, { path: "." }, signal())).toMatchObject({
      kind: "succeeded", data: { path: ".", type: "directory", size: null },
    });
  });

  it("reports the linked file's metadata while retaining the requested relative path", async () => {
    const root = setup(), file = join(root, "target.bin");
    writeFileSync(file, Buffer.from([0, 255, 128, 1]));
    const modified = new Date("2024-02-03T04:05:06.000Z");
    utimesSync(file, modified, modified);
    symlinkSync("target.bin", join(root, "alias.bin"), "file");
    expect(await readMetadata(root, { path: "alias.bin" }, signal())).toEqual({
      kind: "succeeded",
      data: { path: "alias.bin", type: "file", size: 4, modifiedAt: "2024-02-03T04:05:06.000Z" },
    });
  });
});
