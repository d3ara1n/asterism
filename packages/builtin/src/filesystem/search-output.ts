import { isUtf8 } from "node:buffer";
import { posix } from "node:path";
import type { GrepArgs } from "@asterism/builtin-api/contracts";
import { SEARCH_EXCERPT_THRESHOLD, textRow } from "../shared/text-row.ts";
import type { FindResult, GrepResult, SearchStopReason } from "./search-contract.ts";
import { FilesystemError, failed } from "./errors.ts";

const OUTPUT_BYTES = 64 * 1024;
const RECORD_BYTES = 1024 * 1024;
/** stdout chunk boundaries are independent of record boundaries; assemble complete byte records before decoding UTF-8. */
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
/** rg consistently outputs '/' separators; paths relative to the search cwd are mapped back to the resource root. */
export function searchPath(prefix: string | (() => string), path: string): string {
  return posix.join(typeof prefix === "function" ? prefix() : prefix, path);
}

function entryBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value)) + 1; }
class Budget {
  private bytes = 0;
  private entries = 0;
  constructor(private readonly limit: number) {}
  /** Entries with counted set to false (context lines in content mode) consume only the byte budget, not the entry limit. */
  add(value: unknown, counted = true): SearchStopReason {
    const cost = entryBytes(value);
    if (counted && this.entries >= this.limit) return "limit";
    if (this.bytes + cost > OUTPUT_BYTES) return "output_bytes";
    if (counted) this.entries++;
    this.bytes += cost;
    return null;
  }
}

export function findOutput(path: string, prefix: string | (() => string), limit: number) {
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
    submatches?: { start: number }[];
  };
}

export function grepOutput(path: string, prefix: string | (() => string), args: GrepArgs) {
  const mode = args.outputMode ?? "content";
  const result: GrepResult = { path, mode, rows: [], files: [], stopReason: null };
  const budget = new Budget(args.limit ?? 500);
  if (mode === "count") {
    // --count --null --with-filename outputs path NUL count LF; LF within paths does not act as a delimiter.
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
    // Match read's splitLines: remove only an actual LF / CRLF; a standalone CR on the final line belongs to the body.
    const content = text.endsWith("\n") ? text.slice(0, text.endsWith("\r\n") ? -2 : -1) : text;
    const line = event.data.line_number;
    const path = searchPath(prefix, dataText(event.data.path)), match = event.type === "match";
    // Compute anchors from complete lines before extracting excerpts; rg submatch offsets are UTF-8 bytes within the line, while context lines have no match and are excerpted from the start.
    const byte = match ? event.data.submatches?.[0]?.start ?? 0 : 0;
    const focus = content.length > SEARCH_EXCERPT_THRESHOLD ? Buffer.from(content, "utf8").subarray(0, byte).toString("utf8").length : 0;
    const entry: GrepResult["rows"][number] = { ...textRow(line, content, args.anchored !== false, SEARCH_EXCERPT_THRESHOLD, focus), path, match };
    // limit counts only matching lines; context lines are constrained only by the byte budget.
    const stopReason = budget.add(entry, entry.match);
    if (stopReason !== null) { trimDanglingContext(result.rows, args.context ?? 0); return stopReason; }
    result.rows.push(entry);
    return null;
  });
  return { result, records };
}

/**
 * On stopping, the tail may contain leading context for the next unreturned match; retain only the trailing-context range of the last returned match,
 * so every context line belongs to a returned match.
 */
function trimDanglingContext(rows: GrepResult["rows"], context: number): void {
  let last: GrepResult["rows"][number] | undefined;
  for (let index = rows.length - 1; index >= 0; index--) if (rows[index].match) { last = rows[index]; break; }
  while (rows.length) {
    const row = rows[rows.length - 1];
    if (row.match || (last && row.path === last.path && row.line <= last.line + context)) break;
    rows.pop();
  }
}
