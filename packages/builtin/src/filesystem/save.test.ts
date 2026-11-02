import { createReadStream, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveFileContent } from "./save.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() { const root = mkdtempSync(join(tmpdir(), "asterism-save-")); roots.push(root); return root; }

describe("Saving referenced bytes", () => {
  it("can read the destination as its own source without truncating it", async () => {
    const root = setup(), path = join(root, "image.bin"), bytes = Buffer.from([0, 255, 128, 1]);
    writeFileSync(path, bytes);
    expect(await saveFileContent(path, createReadStream(path), new AbortController().signal)).toBe(4);
    expect(readFileSync(path)).toEqual(bytes);
    expect(readdirSync(root)).toEqual(["image.bin"]);
  });
  it("preserves the destination and removes staging bytes when the source fails partway through", async () => {
    const root = setup(), path = join(root, "file.bin");
    writeFileSync(path, "original");
    async function* source() { yield Buffer.from("partial"); throw new Error("Download failed"); }
    await expect(saveFileContent(path, source(), new AbortController().signal)).rejects.toThrow("Download failed");
    expect(readFileSync(path, "utf8")).toBe("original");
    expect(readdirSync(root)).toEqual(["file.bin"]);
  });
  it("does not publish a new file when its source cancels the operation", async () => {
    const root = setup(), path = join(root, "file.bin"), controller = new AbortController();
    async function* source() { yield Buffer.from("partial"); controller.abort(); yield Buffer.from("tail"); }
    await expect(saveFileContent(path, source(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(readdirSync(root)).toEqual([]);
  });
});
