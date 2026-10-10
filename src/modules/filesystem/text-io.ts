import { isUtf8 } from "node:buffer";
import { constants } from "node:fs";
import { open, stat, mkdir, realpath, rename, link, unlink, rmdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { TextError } from "../../tools/text.ts";
import { FilesystemError, failed, rejected } from "./errors.ts";
import { directoryRoot, insideDirectory, outsideDirectory, withinDirectory, writableTarget } from "./paths.ts";

export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
interface FileStamp { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number; mode: number }
export interface TextFile { path: string; text: string; stamp: FileStamp }
const sameStamp = (a: FileStamp, b: FileStamp) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const conflict = () => new FilesystemError(rejected("file_changed", "The file or its path changed while this operation was being prepared; no replacement was committed. Read the target again and reconsider the change before retrying."));
export class UnconfirmedWriteError extends Error {}
export function validateTextSize(text: string): void {
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new TextError("file_too_large", "Text operations are limited to 8 MiB. Reduce the replacement content or choose a smaller file.");
  const bytes = Buffer.from(text);
  if (bytes.toString("utf8") !== text) throw new TextError("invalid_text", "The replacement contains unpaired Unicode surrogates. Supply valid Unicode text before retrying.");
  decodeText(bytes);
}
function decodeText(bytes: Buffer): string {
  if (!isUtf8(bytes) || bytes.subarray(0, 5).toString("ascii") === "%PDF-" || bytes.some(byte => byte < 9 || (byte > 13 && byte < 32))) {
    throw new TextError("unsupported_text", "The target is binary or is not UTF-8 text. Select a UTF-8 text file; this tool cannot decode images, PDFs or other binary formats.");
  }
  return bytes.toString("utf8");
}
/** 固定句柄读取，限制实际字节量，并复核打开后的路径与文件身份。 */
export async function readTextFile(root: string, rel: string, signal: AbortSignal): Promise<TextFile> {
  signal.throwIfAborted();
  const path = await withinDirectory(root, rel);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new FilesystemError(failed("not_file", "The target is not a regular file. Use list to check entry types and select a text file."));
    if (before.size > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit. Choose a smaller file.");
    if (await withinDirectory(root, rel) !== path || !sameStamp(before, await stat(path))) throw conflict();
    const chunks: Buffer[] = [];
    let length = 0;
    while (length <= MAX_TEXT_BYTES) {
      signal.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_TEXT_BYTES + 1 - length));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead)); length += bytesRead;
    }
    if (length > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target grew beyond the 8 MiB text file limit. Choose a smaller file.");
    if (!sameStamp(before, await handle.stat()) || await withinDirectory(root, rel) !== path) throw conflict();
    signal.throwIfAborted();
    return { path, text: decodeText(Buffer.concat(chunks, length)), stamp: before };
  } finally { await handle.close(); }
}

/** 同一真实路径的修改串行，包含不同目录资源指向同一个文件的情况。 */
const mutations = new Map<string, Promise<void>>();
export async function withFileMutation<T>(path: string, work: () => Promise<T>): Promise<T> {
  const previous = mutations.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; });
  mutations.set(path, next);
  await previous;
  try { return await work(); }
  finally { release(); if (mutations.get(path) === next) mutations.delete(path); }
}

/** 同目录暂存后提交；提交前复核路径、文件身份和完整正文，失败清理暂存及空的新目录。 */
export async function commitTextFile(root: string, rel: string, before: TextFile | null, text: string, signal: AbortSignal): Promise<void> {
  validateTextSize(text);
  const selected = await writableTarget(root, rel);
  if (before && before.path !== selected.path) throw conflict();
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
      const canonical = await realpath(current);
      if (!insideDirectory(selected.root, canonical)) throw outsideDirectory();
      if (canonical !== current || !(await stat(current)).isDirectory()) throw conflict();
      signal.throwIfAborted();
    }
    const parentStamp = await stat(parent);
    if (await directoryRoot(root) !== selected.root || (await writableTarget(root, rel)).path !== selected.path) throw conflict();
    temp = join(parent, `.weft-${randomUUID()}.tmp`);
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, before ? before.stamp.mode & 0o777 : 0o666);
    try {
      // 创建后复核父目录与暂存目标，避免向已换位的目录继续写正文。
      const currentParent = await stat(parent);
      if (await realpath(parent) !== parent || currentParent.dev !== parentStamp.dev || currentParent.ino !== parentStamp.ino) throw conflict();
      signal.throwIfAborted();
      await handle.writeFile(text, "utf8");
      if (before) await handle.chmod(before.stamp.mode & 0o777);
      await handle.sync();
    } finally { await handle.close(); }
    signal.throwIfAborted();
    if (await directoryRoot(root) !== selected.root || await realpath(parent) !== parent || (await writableTarget(root, rel)).path !== selected.path) throw conflict();
    const nowParent = await stat(parent);
    if (nowParent.ino !== parentStamp.ino || nowParent.dev !== parentStamp.dev) throw conflict();
    if (before) {
      const currentFile = await readTextFile(root, rel, signal);
      if (!sameStamp(before.stamp, currentFile.stamp) || currentFile.text !== before.text) throw conflict();
    } else {
      try { await stat(selected.path); throw conflict(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    signal.throwIfAborted();
    committing = true;
    if (before) { await rename(temp, selected.path); temp = null; }
    else {
      try { await link(temp, selected.path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") { committing = false; throw conflict(); }
        throw error;
      }
    }
    committed = true;
  } catch (error) {
    if (committing) throw new UnconfirmedWriteError("The filesystem could not confirm the final file replacement. Read the target before retrying; do not assume the content is unchanged.");
    throw error;
  } finally {
    // 提交已经确认时，清理失败不能把已知成功改为失败。
    if (temp) await unlink(temp).catch(() => {});
    if (!committed) for (const directory of createdParents.reverse()) await rmdir(directory).catch(() => {});
  }
}
