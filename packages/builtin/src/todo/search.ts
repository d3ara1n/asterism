import type { z } from "zod";
import type { GrepArgs } from "@asterism-app/builtin-api/contracts";
import { grepText, type TextGrepResult } from "../shared/text-search.ts";
import { stopMessage } from "../filesystem/search-presentation.ts";
import { computeLineHash } from "../shared/hashline/hash.ts";
import { splitLines } from "../shared/hashline/lines.ts";
import { excerptNote, rowText, SEARCH_EXCERPT_THRESHOLD, textRow } from "../shared/text-row.ts";
import type { TodoGrep } from "./contract.ts";
import type { Todo } from "./model.ts";

type TodoGrepResult = z.infer<typeof TodoGrep.schema>;
type Group = TodoGrepResult["matches"][number];
const OUTPUT_BYTES = 64 * 1024;

export interface TodoSearchDocument {
  text: string;
  spans: { target: { id: string }; title: string; start: number; lines: string[] }[];
}

/** Each source line occupies exactly one stdin line, including a task's final empty line. Empty tasks add no searchable lines. */
export function buildTodoSearchDocument(todos: Iterable<Todo>): TodoSearchDocument {
  const spans: TodoSearchDocument["spans"] = [], parts: string[] = [];
  let start = 1;
  for (const todo of todos) {
    const lines = splitLines(todo.content);
    if (!lines.length) continue;
    spans.push({ target: { id: todo.id }, title: todo.title, start, lines });
    parts.push(`${lines.join("\n")}\n`);
    start += lines.length;
  }
  return { text: parts.join(""), spans };
}

/** Context from the combined document belongs only to returned matches within the same task. */
function localContext(rows: Group["rows"], context: number): Group["rows"] {
  const matches = rows.filter(row => row.match).map(row => row.line);
  return rows.filter(row => row.match || matches.some(line => Math.abs(line - row.line) <= context));
}

/** Maps rg's global rows without interpreting its regex or recounting occurrences. */
export function mapTodoGrep(document: TodoSearchDocument, result: TextGrepResult, anchored: boolean, context = 0): TodoGrepResult {
  const groups: Group[] = [];
  let cursor = 0;
  for (const span of document.spans) {
    const rows: Group["rows"] = [];
    while (cursor < result.rows.length && result.rows[cursor].line < span.start + span.lines.length) {
      const row = result.rows[cursor++], line = row.line - span.start + 1;
      const source = span.lines[line - 1];
      // Appending LF can make a final standalone CR look like CRLF to grepText. UTF-8 stdin also replaces isolated surrogates.
      // Rebuild from the original UTF-16 line, not from transport text or an already-excerpted line, and bind the hash locally.
      const local = row.excerpt === null ? textRow(line, source, anchored, SEARCH_EXCERPT_THRESHOLD) : {
        line, content: source.slice(row.excerpt.start, row.excerpt.start + row.content.length),
        hash: anchored ? computeLineHash(line, source) : null,
        excerpt: { start: row.excerpt.start, length: source.length },
      };
      rows.push({ ...local, match: row.match });
    }
    const kept = localContext(rows, context);
    if (kept.length) groups.push({ target: span.target, title: span.title, rows: kept });
  }

  const output: TodoGrepResult = { matches: [], stopReason: result.stopReason };
  // Reserve the longest stop reason up front; this counts the final JSON envelope as well as titles, targets, rows and commas.
  let bytes = Buffer.byteLength(JSON.stringify({ matches: [], stopReason: "output_bytes" }));
  for (const group of groups) {
    const kept: Group = { ...group, rows: [] };
    const headingBytes = Buffer.byteLength(JSON.stringify(kept)) + (output.matches.length ? 1 : 0);
    for (const row of group.rows) {
      const cost = Buffer.byteLength(JSON.stringify(row)) + (kept.rows.length ? 1 : headingBytes);
      if (bytes + cost > OUTPUT_BYTES) {
        output.stopReason = "output_bytes";
        kept.rows = localContext(kept.rows, context);
        if (kept.rows.length) output.matches.push(kept);
        return output;
      }
      bytes += cost;
      kept.rows.push(row);
    }
    output.matches.push(kept);
  }
  return output;
}

export async function grepTodos(todos: Iterable<Todo>, args: GrepArgs, anchored: boolean, signal: AbortSignal): Promise<TodoGrepResult> {
  const document = buildTodoSearchDocument(todos);
  // One Rust-regex search over all Markdown, even when empty so invalid patterns still fail. Global anchors are unused.
  const result = await grepText(document.text, args, false, signal);
  return mapTodoGrep(document, result, anchored, args.context ?? 0);
}

export function todoGrepToModel(data: TodoGrepResult): string {
  const count = data.matches.reduce((sum, group) => sum + group.rows.filter(row => row.match).length, 0);
  const lines = [`${count} matching ${count === 1 ? "line" : "lines"} in ${data.matches.length} ${data.matches.length === 1 ? "task" : "tasks"} · search ${data.stopReason === null ? "complete" : "incomplete"}`];
  const notes: string[] = [];
  for (const group of data.matches) {
    const matches = group.rows.filter(row => row.match);
    lines.push(`${JSON.stringify(group.title)} · target ${JSON.stringify(group.target)}`);
    if (matches.length !== group.rows.length) lines.push(`Matching line numbers: ${matches.map(row => row.line).join(", ")}.`);
    let previous = 0;
    for (const row of group.rows) {
      if (previous && row.line !== previous + 1) lines.push("…");
      lines.push(rowText(row));
      const note = excerptNote(row, `Task ${JSON.stringify(group.target.id)} line ${row.line}`);
      if (note) notes.push(note);
      previous = row.line;
    }
  }
  lines.push(...notes);
  if (!data.matches.length) lines.push(data.stopReason === null ? "No matching lines." : "No results returned; the search is incomplete.");
  if (data.stopReason !== null) lines.push(stopMessage(data.stopReason, true));
  return lines.join("\n");
}
