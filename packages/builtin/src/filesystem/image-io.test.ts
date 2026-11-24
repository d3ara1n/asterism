import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readImageFile } from "./image-io.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("allows an image at 8 MiB and rejects one byte more before returning it", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterism-see-test-"));
  directories.push(root);
  const path = join(root, "image.png"), signal = new AbortController().signal;
  await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  await truncate(path, 8 * 1024 * 1024);
  const image = await readImageFile(root, "image.png", signal);
  expect(image.bytes.length).toBe(8 * 1024 * 1024);
  expect(image.mediaType).toBe("image/png");
  await truncate(path, (8 * 1024 * 1024) + 1);
  await expect(readImageFile(root, "image.png", signal)).rejects.toMatchObject({ code: "file_too_large" });
});
