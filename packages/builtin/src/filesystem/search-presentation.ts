import { excerptNote, rowText } from "../shared/text-row.ts";
import type { FindResult, GrepResult, SearchStopReason } from "./search-contract.ts";

/**
 * 模型投影和界面共用计数与空结果判定。matches 为命中行数（content 含长行片段中的命中，
 * count 为各文件原生计数之和，find／files 为 null）；上下文行不计作命中。
 */
export function searchSummary(data: FindResult | GrepResult) {
  const content = "rows" in data && data.mode === "content";
  const returned = content ? data.rows.length : data.files.length;
  const matches = content ? data.rows.filter(row => row.match).length
    : "rows" in data && data.mode === "count" ? data.files.reduce((sum, file) => sum + (file.count ?? 0), 0) : null;
  return {
    returned,
    unit: content ? "rows" as const : "files" as const,
    files: content ? new Set(data.rows.map(row => row.path)).size : data.files.length,
    matches,
    excerpts: content ? data.rows.filter(row => row.excerpt !== null).length : 0,
    complete: data.stopReason === null,
    empty: returned > 0 ? null : data.stopReason === null ? "no_matches" as const : "incomplete" as const,
  };
}

const plural = (count: number, one: string, other: string) => `${count} ${count === 1 ? one : other}`;

function stopMessage(reason: Exclude<SearchStopReason, null>, content: boolean): string {
  switch (reason) {
    case "limit": return content ? "Search stopped at the matching-line limit." : "Search stopped at the file limit.";
    case "output_bytes": return "Search stopped when the returned results reached the 64 KiB budget.";
    case "record_bytes": return "Search stopped because a process output record exceeded 1 MiB. That record could not be decoded.";
  }
}
function heading(data: FindResult | GrepResult): string {
  const summary = searchSummary(data);
  const files = plural(summary.files, "file", "files");
  const counts = summary.matches === null ? files : `${plural(summary.matches, "matching line", "matching lines")} in ${files}`;
  return `${JSON.stringify(data.path)} · ${counts} · search ${summary.complete ? "complete" : "incomplete"}`;
}
function ending(data: FindResult | GrepResult): string[] {
  const summary = searchSummary(data), lines: string[] = [];
  if (summary.empty === "no_matches") {
    lines.push(summary.unit === "rows" ? "No matching lines." : "No matching files.",
      "Hidden-entry and ignore-file filtering apply unless hidden or noIgnore is set.");
  }
  if (summary.empty === "incomplete") lines.push("No results returned; the search is incomplete.");
  if (data.stopReason !== null) lines.push(stopMessage(data.stopReason, summary.unit === "rows"));
  return lines;
}
export function findToModel(data: FindResult): string {
  return [heading(data), ...data.files.map(path => JSON.stringify(path)), ...ending(data)].join("\n");
}

/** 文件标题给出命中行数；有上下文行时追加命中行号，行本身的格式与 read 一致。 */
function fileHeader(path: string, rows: GrepResult["rows"]): string {
  const matches = rows.filter(row => row.match);
  const lines = matches.length < rows.length ? `: ${matches.map(row => row.line).join(", ")}` : "";
  return `${JSON.stringify(path)} · ${plural(matches.length, "matching line", "matching lines")}${lines}`;
}
export function grepToModel(data: GrepResult): string {
  const lines: string[] = [heading(data)];
  if (data.mode === "content") {
    const byPath = new Map<string, GrepResult["rows"]>();
    for (const row of data.rows) {
      const list = byPath.get(row.path);
      if (list) list.push(row); else byPath.set(row.path, [row]);
    }
    const notes: string[] = [];
    for (const [path, rows] of byPath) {
      lines.push(fileHeader(path, rows));
      let previous = 0;
      for (const row of rows) {
        if (previous && row.line !== previous + 1) lines.push("…");
        lines.push(rowText(row));
        const note = excerptNote(row, `${JSON.stringify(path)} line ${row.line}`);
        if (note) notes.push(note);
        previous = row.line;
      }
    }
    lines.push(...notes);
  } else lines.push(...data.files.map(file => `${JSON.stringify(file.path)}${file.count === null ? "" : `: ${file.count}`}`));
  return [...lines, ...ending(data)].join("\n");
}
