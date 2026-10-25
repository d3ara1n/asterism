import type { FindResult, GrepResult, SearchStopReason } from "./search-contract.ts";

/** 模型投影和界面共用返回计数与空结果判定；上下文和省略行都各占一个返回条目。 */
export function searchSummary(data: FindResult | GrepResult) {
  const content = "rows" in data && data.mode === "content";
  const returned = content ? data.rows.length : data.files.length;
  return {
    returned,
    unit: content ? "rows" as const : "files" as const,
    matching: content ? data.rows.filter(row => row.match).length : null,
    omitted: content ? data.rows.filter(row => row.kind === "omitted").length : 0,
    complete: data.stopReason === null,
    empty: returned > 0 ? null : data.stopReason === null ? "no_matches" as const : "incomplete" as const,
  };
}

const stopMessages: Record<Exclude<SearchStopReason, null>, string> = {
  limit: "Search stopped at the result limit.",
  output_bytes: "Search stopped at the 64 KiB output budget.",
  record_bytes: "Search stopped because a process output record exceeded 1 MiB. That record could not be decoded.",
};
function heading(data: FindResult | GrepResult): string {
  const summary = searchSummary(data);
  const unit = summary.returned === 1 ? summary.unit.slice(0, -1) : summary.unit;
  return `${JSON.stringify(data.path)} · ${summary.returned} ${unit} returned${summary.matching === null ? "" : ` (${summary.matching} matching)`} · search ${summary.complete ? "complete" : "incomplete"}`;
}
function ending(data: FindResult | GrepResult): string[] {
  const summary = searchSummary(data), lines: string[] = [];
  if (summary.empty === "no_matches") lines.push(summary.unit === "rows" ? "No matching lines." : "No matching files.");
  if (summary.empty === "incomplete") lines.push("No results returned; the search is incomplete.");
  if (data.stopReason !== null) lines.push(stopMessages[data.stopReason]);
  return lines;
}
export function findToModel(data: FindResult): string {
  return [heading(data), ...data.files.map(path => JSON.stringify(path)), ...ending(data)].join("\n");
}
export function grepToModel(data: GrepResult): string {
  const lines: string[] = [heading(data)];
  if (data.mode === "content") {
    let path: string | undefined, previous = 0;
    for (const row of data.rows) {
      if (row.path !== path) { lines.push(JSON.stringify(row.path)); path = row.path; previous = 0; }
      else if (row.line !== previous + 1) lines.push("…");
      if (row.kind === "omitted") {
        lines.push(`${row.line} — ${row.match ? "matching" : "context"} line; content omitted because the complete row exceeds the 64 KiB output budget.`);
      } else lines.push(`${row.line}${row.hash === null ? "" : `#${row.hash}`}│${row.content}`);
      previous = row.line;
    }
  } else lines.push(...data.files.map(file => `${JSON.stringify(file.path)}${file.count === null ? "" : `: ${file.count}`}`));
  return [...lines, ...ending(data)].join("\n");
}
