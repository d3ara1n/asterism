import { isUtf8 } from "node:buffer";
import { readFileSync, statSync, type Stats } from "node:fs";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { TextError } from "../shared/text.ts";
import { FilesystemError, failed } from "./errors.ts";

export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const temporaryFilePrefix = ".builtin-";
export interface TextFile { text: string; mode: number }
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
function validateFile(info: Stats): void {
  if (!info.isFile()) throw new FilesystemError(failed("not_file", "The target requires a regular UTF-8 text file."));
  if (info.size > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit.");
}
function textFile(bytes: Buffer, mode: number): TextFile {
  if (bytes.length > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit.");
  return { text: decodeText(bytes), mode };
}
/** 同步装配与显式目录刷新使用同一文本格式校验。 */
export function readTextFileSync(path: string): TextFile {
  const info = statSync(path);
  validateFile(info);
  return textFile(readFileSync(path), info.mode);
}
/** 读取操作开始时已解析的真实路径。 */
export async function readTextFile(path: string, signal: AbortSignal): Promise<TextFile> {
  signal.throwIfAborted();
  const info = await stat(path);
  validateFile(info);
  return textFile(await readFile(path, { signal }), info.mode);
}

/** 同目录写入暂存文件并落盘，再以 rename 原子替换目标；失败时目标保持原样并清理暂存。 */
export async function commitTextFile(path: string, before: TextFile | null, text: string, signal: AbortSignal): Promise<void> {
  validateTextSize(text);
  signal.throwIfAborted();
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const temp = join(parent, `${temporaryFilePrefix}${randomUUID()}.tmp`);
  try {
    await writeFile(temp, text, { encoding: "utf8", flush: true, signal });
    if (before) await chmod(temp, before.mode & 0o777);
    signal.throwIfAborted();
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}
