import { describe, expect, it } from "vitest";
import { readText } from "../shared/text.ts";
import { findOutput, grepOutput, SearchRecords } from "./search-output.ts";
import { excerptWindow } from "../shared/text-row.ts";
import { computeLineHash } from "../shared/hashline/hash.ts";
import { findToModel, grepToModel, searchSummary } from "./search-presentation.ts";
import { displayPath, grepFiles, groupByDirectory, searchFilters, searchOptions } from "./search-layout.ts";
import { executablePath, searchArguments } from "./search-process.ts";
import type { SearchStopReason } from "./search-contract.ts";

const event = (type: "match" | "context", text: string, line: number, submatch?: number) => Buffer.from(`${JSON.stringify({
  type, data: { path: { text: "./file.txt" }, lines: { text }, line_number: line,
    ...(submatch === undefined ? {} : { submatches: [{ start: submatch }] }) },
})}\n`);

/** Delivers only the byte protocol and records stop reasons at the same boundary as the caller; starts no real processes. */
function collect<T extends { stopReason: SearchStopReason }>(output: { result: T; records: SearchRecords }, ...chunks: Buffer[]): T {
  for (const chunk of chunks) {
    output.result.stopReason = output.records.push(chunk);
    if (output.result.stopReason !== null) return output.result;
  }
  output.records.finish();
  return output.result;
}

describe("Search output protocol", () => {
  // OS pipes split at arbitrary bytes; filenames may contain newlines, so NUL is the actual find boundary.
  it("Preserves UTF-8 across chunks and paths containing newlines, mapping them back to the resource root", () => {
    const output = findOutput("src", "src", 10);
    const bytes = Buffer.from("./中文\n文件.ts\0./next.ts\0");
    for (const byte of bytes) expect(output.records.push(Buffer.from([byte]))).toBeNull();
    output.records.finish();
    expect(output.result.files).toEqual(["src/中文\n文件.ts", "src/next.ts"]);
  });

  // grep and read anchors must be interchangeable; CRLF, BOM, and a final-line CR are especially likely to produce differing body text.
  it("Matches and context use complete lines, with anchors directly usable by the existing edit", () => {
    const source = "\uFEFFfirst\r\n中文\r\nlast\r";
    const data = collect(grepOutput(".", "", { pattern: "中文" }),
      event("context", "\uFEFFfirst\r\n", 1), event("match", "中文\r\n", 2), event("context", "last\r", 3));
    const read = readText(source, true);
    expect(data.rows.map(({ path: _path, match: _match, ...row }) => row)).toEqual(read.rows);
    expect(data.rows.map(row => row.match)).toEqual([false, true, false]);
    expect(grepToModel(data)).toContain(`2#${read.rows[1].hash}│中文`);
    expect(searchSummary(data)).toMatchObject({ returned: 3, matches: 1, excerpts: 0, complete: true });
    // When context lines are present, file headings list matching line numbers so the model need not infer matches from position.
    expect(grepToModel(data)).toContain('"file.txt" · 1 matching line: 2');
  });

  // A single minified JS/SVG line can reach hundreds of KiB; matches must remain visible, with excerpts centered near matches rather than line starts. rg offsets are UTF-8 bytes; anchors use full lines, and excerpts must not create false anchors.
  it("Returns excerpts near matches in oversized lines, locates them by UTF-8 byte offsets, and anchors them to complete lines", () => {
    const long = `${"中".repeat(2000)}svg${"x".repeat(2000)}`;
    const data = collect(grepOutput("assets", "assets", { pattern: "svg" }),
      event("match", `${long}\n`, 1, 6000), event("match", "svg\n", 2));
    const excerpt = data.rows[0];
    expect(excerpt).toMatchObject({ path: "assets/file.txt", line: 1, match: true, hash: computeLineHash(1, long),
      excerpt: { start: 1880, length: long.length } });
    expect(excerpt.content.slice(120, 123)).toBe("svg");
    expect(data.rows[1]).toMatchObject({ content: "svg", line: 2, excerpt: null });
    expect(searchSummary(data)).toMatchObject({ returned: 2, matches: 2, excerpts: 1, complete: true, empty: null });
    const model = grepToModel(data);
    expect(model).toContain("2 matching lines in 1 file · search complete");
    // When every line is a matching line, the heading does not repeat line numbers.
    expect(model).toContain('"assets/file.txt" · 2 matching lines\n');
    // Lines contain only excerpt text; ranges are stated outside the line to avoid confusion with body content.
    expect(model).toContain(`1#${excerpt.hash}│中`);
    expect(model).toContain('"assets/file.txt" line 1 is an excerpt (characters 1880–2280 of 4003); its anchor refers to the complete line.');
  });

  // Long context lines have no match to center on, so excerpt from the start; excerpts must not count as matches or consume the matching-line limit.
  it("Excerpts oversized context lines from the start without consuming the matching-line limit", () => {
    const data = collect(grepOutput(".", "", { pattern: "found", limit: 1, context: 1 }),
      event("context", `${'"'.repeat(40 * 1024)}\n`, 1), event("match", "found\n", 2));
    expect(data.rows.map(row => [row.excerpt !== null, row.line, row.match])).toEqual([[true, 1, false], [false, 2, true]]);
    expect(data.rows[0]).toMatchObject({ content: '"'.repeat(400), excerpt: { start: 0, length: 40 * 1024 } });
    expect(data.stopReason).toBeNull();
    expect(searchSummary(data)).toMatchObject({ returned: 2, matches: 1, excerpts: 1, complete: true });
    expect(grepToModel(data)).toContain(`characters 0–400 of ${40 * 1024}`);
  });

  // limit counts only matching lines: matches before the limit retain full trailing context; when stopping at the next match, its already delivered leading context belongs to no returned match and must be trimmed.
  it("The matching-line limit excludes context, and stopping trims leading context for unreturned matches", () => {
    const data = collect(grepOutput(".", "", { pattern: "x", limit: 1, context: 1 }),
      event("context", "a\n", 1), event("match", "x\n", 2), event("context", "b\n", 3),
      event("context", "c\n", 5), event("match", "x\n", 6));
    expect(data.rows.map(row => row.line)).toEqual([1, 2, 3]);
    expect(data.stopReason).toBe("limit");
    expect(grepToModel(data)).toContain("Search stopped at the matching-line limit.");
  });

  // When an ordinary line exceeds only the remaining budget, report that search stopped instead of treating it as an oversized line and continuing the scan.
  it("Distinguishes entry limits from cumulative byte limits and clearly counts returned entries", () => {
    const exact = collect(findOutput(".", "", 1), Buffer.from("./a\0"));
    expect(exact.stopReason).toBeNull();
    const limited = collect(findOutput(".", "", 1), Buffer.from("./a\0./b\0"));
    expect(limited.stopReason).toBe("limit");
    expect(limited.files).toEqual(["a"]);
    expect(findToModel(limited)).toContain("1 file · search incomplete");
    expect(findToModel(limited)).toContain("Search stopped at the file limit.");
    const lines = Array.from({ length: 80 }, (_, index) => event("match", `${"a".repeat(900)}\n`, index + 1));
    const data = collect(grepOutput(".", "", { pattern: "." }), ...lines);
    expect(data.stopReason).toBe("output_bytes");
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.length).toBeLessThan(80);
    expect(data.rows.every(row => row.excerpt === null)).toBe(true);
    expect(grepToModel(data)).toContain("Search stopped when the returned results reached the 64 KiB budget.");
    expect(grepToModel(data)).not.toContain("narrower");
  });

  // An oversized pipe record has not yet been parsed; even an empty array means only that nothing was returned, not that there are no matches, and cannot justify fabricated locations.
  it("Record limits and empty byte-truncated results never report no matches", () => {
    const data = collect(grepOutput(".", "", { pattern: "." }), event("match", "x".repeat(1024 * 1024), 1));
    expect(data.stopReason).toBe("record_bytes");
    expect(data.rows).toEqual([]);
    expect(searchSummary(data)).toMatchObject({ returned: 0, complete: false, empty: "incomplete" });
    expect(grepToModel(data)).toContain("No results returned; the search is incomplete.");
    expect(grepToModel(data)).toContain("record exceeded 1 MiB");
    expect(grepToModel(data)).not.toContain("No matching");
    const files = collect(findOutput(".", "", 10), Buffer.from(`${"x".repeat(64 * 1024)}\0`));
    expect(files.stopReason).toBe("output_bytes");
    expect(findToModel(files)).toContain("No results returned; the search is incomplete.");
    expect(findToModel(files)).not.toContain("No matching");
  });

  // An empty result is not itself a failure; only normal EOF permits reporting no matches in the specified scope.
  it("A normally completed empty search explicitly reports no matches", () => {
    const grep = collect(grepOutput(".", "", { pattern: "." }));
    const find = collect(findOutput(".", "", 10));
    expect(searchSummary(grep)).toMatchObject({ complete: true, empty: "no_matches" });
    expect(grepToModel(grep)).toContain("No matching lines.");
    expect(findToModel(find)).toContain("No matching files.");
    const files = collect(grepOutput(".", "", { pattern: ".", outputMode: "files" }));
    expect(grepToModel(files)).toContain("No matching files.");
  });

  // rg outputs base64 for non-UTF-8 data; replacement characters would change file identity or fabricate edit anchors.
  it("Decodes valid base64 body text and rejects unrepresentable paths or text", () => {
    const output = grepOutput(".", "", { pattern: ".", anchored: false });
    const encode = (bytes: Buffer) => Buffer.from(`${JSON.stringify({
      type: "match", data: { path: { text: "a" }, lines: { bytes: bytes.toString("base64") }, line_number: 1 },
    })}\n`);
    output.records.push(encode(Buffer.from("中文\n")));
    expect(output.result.rows[0]).toMatchObject({ content: "中文", hash: null, excerpt: null });
    expect(() => output.records.push(encode(Buffer.from([0xff])))).toThrow(/not UTF-8/);
    expect(() => findOutput(".", "", 10).records.push(Buffer.from([0xff, 0]))).toThrow(/not UTF-8/);
  });

  // count is the native matching-line count per file; paths may contain LF, so the entire output cannot simply be split into lines.
  it("File and count modes preserve paths containing delimiter characters and native counts", () => {
    const files = collect(grepOutput(".", "", { pattern: ".", outputMode: "files" }), Buffer.from("./a:b.txt\0"));
    expect(files.files).toEqual([{ path: "a:b.txt", count: null }]);
    const output = grepOutput(".", "", { pattern: ".", outputMode: "count", limit: 2 });
    const bytes = Buffer.from("./中文\n文件\0" + "2\n./b\0" + "10\n./c\0" + "8\n");
    const counts = collect(output, ...Array.from(bytes, byte => Buffer.from([byte])));
    expect(counts.files).toEqual([{ path: "中文\n文件", count: 2 }, { path: "b", count: 10 }]);
    expect(counts.rows).toEqual([]);
    expect(counts.stopReason).toBe("limit");
    expect(grepToModel(counts)).toContain("12 matching lines in 2 files · search incomplete");
    expect(grepToModel(counts)).toContain("Search stopped at the file limit.");
    const partial = grepOutput(".", "", { pattern: ".", outputMode: "count" });
    partial.records.push(Buffer.from("./a\0"));
    expect(() => partial.records.finish()).toThrow(/incomplete/);
  });

  // EOF interruption is a protocol failure, distinct from a budget stop with an explicit reason.
  it("Incomplete records cannot be returned as normal completion", () => {
    const records = new SearchRecords(10, () => null);
    records.push(Buffer.from('{"type":'));
    expect(() => records.finish()).toThrow(/incomplete/);
  });
});

describe("Search arguments and dispatch paths", () => {
  // Patterns and filenames beginning with - must not become options; spaces and shell punctuation remain within a single argv argument.
  it("Passes patterns, globs, and targets through argv and isolates user rg configuration", () => {
    const args = searchArguments("grep", { pattern: "-x; echo bad", literal: true, ignoreCase: true,
      glob: ["**/*.ts", "!vendor/**"], context: 2 }, "./-target");
    expect(args).toContain("--no-config");
    expect(args.slice(args.indexOf("--regexp"), args.indexOf("--regexp") + 2)).toEqual(["--regexp", "-x; echo bad"]);
    expect(args.slice(-4)).toEqual(["--glob", "!.git", "--", "./-target"]);
    expect(args).toContain("--fixed-strings");
    expect(args).toContain("--ignore-case");
    expect(args).toContain("--encoding=none");
    expect(args).toContain("!vendor/**");
    expect(searchArguments("find", { pattern: "**/*.ts" }, ".")).toContain("--null");
    const count = searchArguments("grep", { pattern: ".", outputMode: "count" }, "./a");
    expect(count).toContain("--count");
    expect(count).toContain("--with-filename");
    expect(count).not.toContain("--json");
  });

  // spawn cannot read asar virtual paths; also cover Windows separators without incorrectly rewriting ordinary directory names.
  it("Rewrites only archive path segments to locate unpacked executables across platforms", () => {
    expect(executablePath("/app/app.asar/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg"))
      .toBe("/app/app.asar.unpacked/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg");
    expect(executablePath("C:\\app\\app.asar\\node_modules\\rg.exe")).toBe("C:\\app\\app.asar.unpacked\\node_modules\\rg.exe");
    expect(executablePath("/project.asar.backup/rg")).toBe("/project.asar.backup/rg");
    expect(executablePath("/app/app.asar.unpacked/rg")).toBe("/app/app.asar.unpacked/rg");
  });
});

describe("Search result UI layout", () => {
  // Display paths relative to the selected target; for a single-file grep, the line path equals the target itself and would become empty after prefix removal.
  it("Displays paths relative to the search target, retains filenames for single-file targets, and does not trim sibling directories sharing a prefix", () => {
    expect(displayPath(".", "src/a.ts")).toBe("src/a.ts");
    expect(displayPath("src", "src/lib/a.ts")).toBe("lib/a.ts");
    expect(displayPath("src/a.ts", "src/a.ts")).toBe("a.ts");
    expect(displayPath("src", "srcx/a.ts")).toBe("srcx/a.ts");
  });

  // rg parallel output order is nondeterministic; plain string sorting can place root-level files between subdirectories and split one directory into multiple groups.
  it("Groups entries from the same directory contiguously, places root-level entries first, and applies the budget after sorting", () => {
    const { groups, omitted } = groupByDirectory(["b/z.ts", "a.ts", "b/c/d.ts", "b/a.ts", "b.ts"], path => path, 4);
    expect(groups.map(group => [group.directory, group.entries.map(entry => entry.name)])).toEqual([
      ["", ["a.ts", "b.ts"]], ["b", ["a.ts", "z.ts"]],
    ]);
    expect(omitted).toBe(1);
  });

  // Excerpt boundaries inside surrogate pairs leave lone surrogates that display as garbled text.
  it("Excerpt windows do not split surrogate pairs", () => {
    expect(excerptWindow("😀".repeat(1000), 1001)).toEqual({ start: 882, end: 1280 });
  });

  // Merging nonconsecutive lines into one excerpt makes CodeRows number them consecutively, producing incorrect line numbers; long-line excerpts participate in contiguous grouping like full lines, with ellipses marking both ends.
  it("Sorts lines within files, groups consecutive lines, splits at line-number gaps, and budgets each file independently", () => {
    const row = (line: number, match = true) => ({ path: "a.ts", line, content: `l${line}`, hash: null, excerpt: null, match });
    const files = grepFiles([row(6), row(2, false), row(3),
      { path: "a.ts", line: 4, match: false, content: "mid", hash: null, excerpt: { start: 5, length: 20 } },
      row(9), { ...row(1), path: "b.ts" }], 4);
    expect(files.map(file => file.path)).toEqual(["a.ts", "b.ts"]);
    expect(files[0].segments).toEqual([
      { rows: [{ line: 2, content: "l2", match: false }, { line: 3, content: "l3", match: true }, { line: 4, content: "…mid…", match: false }] },
      { rows: [{ line: 6, content: "l6", match: true }] },
    ]);
    expect(files[0]).toMatchObject({ matches: 3, omitted: 1 });
    expect(files[1]).toMatchObject({ matches: 1, omitted: 0 });
  });

  // The header summary must not count context lines as matches or line counts as file counts.
  it("content summaries count matching lines and affected files; count summaries sum per-file match counts", () => {
    const content = collect(grepOutput(".", "", { pattern: "x", context: 1 }),
      event("context", "a\n", 1), event("match", "x\n", 2), event("match", "x\n", 3));
    expect(searchSummary(content)).toMatchObject({ files: 1, matches: 2, complete: true });
    const counts = collect(grepOutput(".", "", { pattern: ".", outputMode: "count" }), Buffer.from("./a\0" + "2\n./b\0" + "10\n"));
    expect(searchSummary(counts)).toMatchObject({ files: 2, matches: 12, complete: true });
  });

  // Option rows show only arguments differing from defaults; partial JSON during input filling may contain fields of unclear shape.
  it("Lists only nondefault arguments and ignores fields of unclear shape", () => {
    expect(searchOptions({ pattern: "x", ignoreCase: true, literal: false, context: 0, limit: 500, outputMode: "content" })).toEqual([
      { kind: "flag", flag: "ignoreCase" },
    ]);
    expect(searchOptions({ outputMode: "count", context: 2, limit: 50, glob: ["*.ts", 3] })).toEqual([
      { kind: "mode", value: "count" }, { kind: "context", value: 2 }, { kind: "limit", value: 50 }, { kind: "glob", value: "*.ts" },
    ]);
    expect(searchOptions(null)).toEqual([]);
    // Empty-result hints list only filters still in effect; when both are disabled, there are no filters to explain.
    expect(searchFilters({})).toBe("both");
    expect(searchFilters({ hidden: true })).toBe("ignored");
    expect(searchFilters({ noIgnore: true })).toBe("hidden");
    expect(searchFilters({ hidden: true, noIgnore: true })).toBeNull();
  });
});
