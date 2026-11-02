import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Stream into a sibling file; a failed download or cancellation preserves the previous destination. */
export async function saveFileContent(path: string, source: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const before = await stat(path).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const parent = dirname(path), temporary = join(parent, `.builtin-${randomUUID()}.tmp`);
  await mkdir(parent, { recursive: true });
  let size = 0;
  async function* bytes() {
    for await (const chunk of source) { signal.throwIfAborted(); size += chunk.length; yield chunk; }
  }
  try {
    await writeFile(temporary, bytes(), { signal, flush: true });
    if (before) await chmod(temporary, before.mode & 0o777);
    signal.throwIfAborted();
    await rename(temporary, path);
    return size;
  } finally { await rm(temporary, { force: true }); }
}
