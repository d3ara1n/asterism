import { isUtf8 } from "node:buffer";
import { constants } from "node:fs";
import { open, mkdir, rename, unlink, rmdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { TextError } from "../shared/text.ts";
import { FilesystemError, failed } from "./errors.ts";

export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const temporaryFilePrefix = ".builtin-";
export interface TextFile { text: string; mode: number }
export class UnconfirmedWriteError extends Error {}
export function validateTextSize(text: string): void {
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new TextError("file_too_large", "Text operations are limited to 8 MiB.");
  const bytes = Buffer.from(text);
  if (bytes.toString("utf8") !== text) throw new TextError("invalid_text", "The replacement contains unpaired Unicode surrogates.");
  decodeText(bytes);
}
function decodeText(bytes: Buffer): string {
  if (!isUtf8(bytes) || bytes.subarray(0, 5).toString("ascii") === "%PDF-" || bytes.some(byte => byte < 9 || (byte > 13 && byte < 32))) {
    throw new TextError("unsupported_text", "The content format differs from the supported UTF-8 text format.");
  }
  return bytes.toString("utf8");
}
/** 读取操作开始时已解析的真实路径，以固定句柄限制实际字节量。 */
export async function readTextFile(path: string, signal: AbortSignal): Promise<TextFile> {
  signal.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FilesystemError(failed("not_file", "The target requires a regular UTF-8 text file."));
    if (info.size > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit.");
    const chunks: Buffer[] = [];
    let length = 0;
    while (length <= MAX_TEXT_BYTES) {
      signal.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_TEXT_BYTES + 1 - length));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead)); length += bytesRead;
    }
    if (length > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit.");
    signal.throwIfAborted();
    return { text: decodeText(Buffer.concat(chunks, length)), mode: info.mode };
  } finally { await handle.close(); }
}

/** 向已解析的目标写入；同目录暂存后原子替换，失败清理暂存及空的新目录。 */
export async function commitTextFile(selected: { root: string; path: string }, before: TextFile | null, text: string, signal: AbortSignal): Promise<void> {
  validateTextSize(text);
  const parent = dirname(selected.path);
  const createdParents: string[] = [];
  let temp: string | null = null;
  let committing = false;
  let committed = false;
  try {
    signal.throwIfAborted();
    let current = selected.root;
    for (const component of relative(selected.root, parent).split(sep).filter(Boolean)) {
      current = join(current, component);
      try { await mkdir(current); createdParents.push(current); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      signal.throwIfAborted();
    }
    temp = join(parent, `${temporaryFilePrefix}${randomUUID()}.tmp`);
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, before ? before.mode & 0o777 : 0o666);
    try {
      signal.throwIfAborted();
      await handle.writeFile(text, "utf8");
      if (before) await handle.chmod(before.mode & 0o777);
      await handle.sync();
    } finally { await handle.close(); }
    signal.throwIfAborted();
    committing = true;
    await rename(temp, selected.path);
    temp = null;
    committed = true;
  } catch (error) {
    if (committing) throw new UnconfirmedWriteError("The final file replacement has an unknown outcome.");
    throw error;
  } finally {
    // 提交已经确认时，清理失败不能把已知成功改为失败。
    if (temp) await unlink(temp).catch(() => {});
    if (!committed) for (const directory of createdParents.reverse()) await rmdir(directory).catch(() => {});
  }
}
