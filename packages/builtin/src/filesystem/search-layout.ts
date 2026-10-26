import type { GrepArgs } from "@asterism/builtin-api/contracts";
import type { GrepResult } from "./search-contract.ts";
import { displayText } from "../shared/text-row.ts";

/** 界面路径相对所选搜索目标；选中单个文件时保留文件名，选区外的路径原样显示。 */
export function displayPath(base: string, path: string): string {
  const prefix = base.split("/").filter(part => part && part !== ".").join("/");
  if (!prefix) return path;
  if (path === prefix) return path.slice(path.lastIndexOf("/") + 1);
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
}
export function splitPath(path: string): { directory: string; name: string } {
  const index = path.lastIndexOf("/");
  return index < 0 ? { directory: "", name: path } : { directory: path.slice(0, index), name: path.slice(index + 1) };
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** 按（目录，文件名）排序，使同一目录连续；根层条目排在最前。 */
function byLocation(a: string, b: string): number {
  const left = splitPath(a), right = splitPath(b);
  return compare(left.directory, right.directory) || compare(left.name, right.name);
}

export interface DirectoryGroup<T> { directory: string; entries: { name: string; item: T }[] }
/** ripgrep 并行遍历的顺序不定；展示按位置排序后取预算内条目，再按目录分组。 */
export function groupByDirectory<T>(items: readonly T[], pathOf: (item: T) => string, limit: number) {
  const sorted = [...items].sort((a, b) => byLocation(pathOf(a), pathOf(b)));
  const groups: DirectoryGroup<T>[] = [];
  for (const item of sorted.slice(0, limit)) {
    const { directory, name } = splitPath(pathOf(item));
    const last = groups.at(-1);
    if (last?.directory === directory) last.entries.push({ name, item });
    else groups.push({ directory, entries: [{ name, item }] });
  }
  return { groups, omitted: Math.max(0, sorted.length - limit) };
}

type Row = GrepResult["rows"][number];
export interface GrepSegment { rows: { line: number; content: string; match: boolean }[] }
export interface GrepFile { path: string; matches: number; segments: GrepSegment[]; omitted: number }
/** content 结果按文件聚合、文件内按行号排序；连续行合成一段，长行片段以省略号标出两端，每个文件各自承担行预算。 */
export function grepFiles(rows: readonly Row[], limit: number): GrepFile[] {
  const byPath = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byPath.get(row.path);
    if (list) list.push(row); else byPath.set(row.path, [row]);
  }
  return [...byPath].map(([path, list]) => {
    const sorted = [...list].sort((a, b) => a.line - b.line);
    const segments: GrepSegment[] = [];
    for (const row of sorted.slice(0, limit)) {
      const entry = { line: row.line, content: displayText(row), match: row.match };
      const last = segments.at(-1);
      if (last && last.rows.at(-1)!.line + 1 === row.line) last.rows.push(entry);
      else segments.push({ rows: [entry] });
    }
    return { path, matches: list.filter(row => row.match).length, segments, omitted: Math.max(0, sorted.length - limit) };
  });
}

export type SearchOption =
  | { kind: "flag"; flag: "literal" | "ignoreCase" | "word" | "hidden" | "noIgnore" }
  | { kind: "context" | "limit"; value: number }
  | { kind: "mode"; value: "files" | "count" }
  | { kind: "glob"; value: string };
/** 只列出偏离默认值的参数；部分 JSON 参数中形状不明的字段直接忽略。 */
export function searchOptions(args: unknown): SearchOption[] {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return [];
  const value = args as Partial<Record<keyof GrepArgs, unknown>>;
  const options: SearchOption[] = [];
  if (value.outputMode === "files" || value.outputMode === "count") options.push({ kind: "mode", value: value.outputMode });
  for (const flag of ["literal", "ignoreCase", "word", "hidden", "noIgnore"] as const) {
    if (value[flag] === true) options.push({ kind: "flag", flag });
  }
  if (typeof value.context === "number" && value.context > 0) options.push({ kind: "context", value: value.context });
  if (typeof value.limit === "number" && value.limit !== 500) options.push({ kind: "limit", value: value.limit });
  if (Array.isArray(value.glob)) {
    for (const glob of value.glob) if (typeof glob === "string") options.push({ kind: "glob", value: glob });
  }
  return options;
}

/** 空结果时提示仍生效的筛选：hidden 未开启时隐藏项被跳过，noIgnore 未开启时 ignore 文件生效。 */
export function searchFilters(args: unknown): "both" | "hidden" | "ignored" | null {
  const value = args !== null && typeof args === "object" && !Array.isArray(args) ? args as { hidden?: unknown; noIgnore?: unknown } : {};
  const hidden = value.hidden !== true, ignored = value.noIgnore !== true;
  return hidden && ignored ? "both" : hidden ? "hidden" : ignored ? "ignored" : null;
}
