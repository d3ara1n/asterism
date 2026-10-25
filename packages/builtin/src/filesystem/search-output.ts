import { isUtf8 } from "node:buffer";
import { posix } from "node:path";
import type { GrepArgs } from "@atelier/builtin-api/contracts";
import { computeLineHash } from "../shared/hashline/hash.ts";
import type { FindResult, GrepResult, SearchStopReason } from "./search-contract.ts";
import { FilesystemError, failed } from "./errors.ts";

const OUTPUT_BYTES = 64 * 1024;
const RECORD_BYTES = 1024 * 1024;

/** stdout 分块与记录边界独立；先拼完整字节记录，再解码 UTF-8。 */
export class SearchRecords {
  private pending = Buffer.alloc(0);
  constructor(private readonly delimiter: number | (() => number), private readonly consume: (record: Buffer) => SearchStopReason,
    private readonly complete: () => boolean = () => true) {}
  push(chunk: Buffer): SearchStopReason {
    let offset = 0;
    for (;;) {
      const end = chunk.indexOf(typeof this.delimiter === "number" ? this.delimiter : this.delimiter(), offset);
      const part = chunk.subarray(offset, end < 0 ? chunk.length : end);
      if (this.pending.length + part.length > RECORD_BYTES) return "record_bytes";
      const record = this.pending.length ? Buffer.concat([this.pending, part]) : part;
      if (end < 0) { this.pending = Buffer.from(record); return null; }
      this.pending = Buffer.alloc(0);
      const stopReason = this.consume(record);
      if (stopReason !== null) return stopReason;
      offset = end + 1;
    }
  }
  finish(): void {
    if (this.pending.length || !this.complete()) throw new FilesystemError(failed("search_protocol", "The search process returned an incomplete output record."));
  }
}

function utf8(bytes: Buffer): string {
  if (!isUtf8(bytes)) throw new FilesystemError(failed("search_encoding", "A matching path or content line is not UTF-8 and cannot be represented by this tool."));
  return bytes.toString("utf8");
}
function dataText(value: { text?: string; bytes?: string }): string {
  if (typeof value.text === "string") return value.text;
  if (typeof value.bytes === "string") return utf8(Buffer.from(value.bytes, "base64"));
  throw new FilesystemError(failed("search_protocol", "The search process returned an invalid text field."));
}
/** rg 固定以 '/' 输出；相对搜索 cwd 的路径映射回资源根。 */
export function searchPath(prefix: string, path: string): string {
  return posix.join(prefix, path);
}

function entryBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value)) + 1; }
class Budget {
  private bytes = 0;
  private entries = 0;
  constructor(private readonly limit: number) {}
  add(value: unknown): SearchStopReason {
    const cost = entryBytes(value);
    if (this.entries >= this.limit) return "limit";
    if (this.bytes + cost > OUTPUT_BYTES) return "output_bytes";
    this.entries++; this.bytes += cost;
    return null;
  }
}

export function findOutput(path: string, prefix: string, limit: number) {
  const result: FindResult = { path, files: [], stopReason: null };
  const budget = new Budget(limit);
  const records = new SearchRecords(0, record => {
    const file = searchPath(prefix, utf8(record));
    const stopReason = budget.add(file);
    if (stopReason !== null) return stopReason;
    result.files.push(file);
    return null;
  });
  return { result, records };
}

interface RgEvent {
  type: string;
  data: {
    path: { text?: string; bytes?: string };
    lines: { text?: string; bytes?: string };
    line_number: number;
  };
}

export function grepOutput(path: string, prefix: string, args: GrepArgs) {
  const mode = args.outputMode ?? "content";
  const result: GrepResult = { path, mode, rows: [], files: [], stopReason: null };
  const budget = new Budget(args.limit ?? 500);
  if (mode === "count") {
    // --count --null --with-filename 输出 path NUL count LF；路径中的 LF 不参与分隔。
    let file: string | undefined;
    const records = new SearchRecords(() => file === undefined ? 0 : 10, record => {
      if (file === undefined) { file = searchPath(prefix, utf8(record)); return null; }
      const countText = record.toString("ascii");
      if (!/^\d+$/.test(countText)) throw new FilesystemError(failed("search_protocol", "The search process returned an invalid line count."));
      const entry = { path: file, count: Number(countText) };
      file = undefined;
      const stopReason = budget.add(entry);
      if (stopReason !== null) return stopReason;
      result.files.push(entry);
      return null;
    }, () => file === undefined);
    return { result, records };
  }
  const records = new SearchRecords(mode === "files" ? 0 : 10, record => {
    if (mode === "files") {
      const entry = { path: searchPath(prefix, utf8(record)), count: null };
      const stopReason = budget.add(entry);
      if (stopReason !== null) return stopReason;
      result.files.push(entry);
      return null;
    }
    const event = JSON.parse(record.toString("utf8")) as RgEvent;
    if (event.type !== "match" && event.type !== "context") return null;
    const text = dataText(event.data.lines);
    // 与 read 的 splitLines 保持一致：只移除实际存在的 LF / CRLF，末行独立 CR 属于正文。
    const content = text.endsWith("\n") ? text.slice(0, text.endsWith("\r\n") ? -2 : -1) : text;
    const line = event.data.line_number;
    const row = { kind: "line" as const, path: searchPath(prefix, dataText(event.data.path)), line, content,
      hash: args.anchored === false ? null : computeLineHash(line, content), match: event.type === "match" };
    // 单行本身超限时保留定位和匹配事实并继续搜索；累计预算不足则停止，二者分别表达。
    const entry = entryBytes(row) > OUTPUT_BYTES
      ? { kind: "omitted" as const, path: row.path, line, match: row.match } : row;
    const stopReason = budget.add(entry);
    if (stopReason !== null) return stopReason;
    result.rows.push(entry);
    return null;
  });
  return { result, records };
}
