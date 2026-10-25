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

/** 只交付字节协议，在调用方相同的边界记录停止原因；不启动真实进程。 */
function collect<T extends { stopReason: SearchStopReason }>(output: { result: T; records: SearchRecords }, ...chunks: Buffer[]): T {
  for (const chunk of chunks) {
    output.result.stopReason = output.records.push(chunk);
    if (output.result.stopReason !== null) return output.result;
  }
  output.records.finish();
  return output.result;
}

describe("搜索输出协议", () => {
  // OS 管道在任意字节分块；文件名也可能含换行，NUL 才是 find 的真实边界。
  it("跨块 UTF-8 与含换行路径保持原样，并映射回资源根", () => {
    const output = findOutput("src", "src", 10);
    const bytes = Buffer.from("./中文\n文件.ts\0./next.ts\0");
    for (const byte of bytes) expect(output.records.push(Buffer.from([byte]))).toBeNull();
    output.records.finish();
    expect(output.result.files).toEqual(["src/中文\n文件.ts", "src/next.ts"]);
  });

  // grep 与 read 的锚点必须可互用；CRLF、BOM 与末行 CR 最易产生不同正文。
  it("匹配与上下文使用完整行，锚点可直接交给现有 edit", () => {
    const source = "\uFEFFfirst\r\n中文\r\nlast\r";
    const data = collect(grepOutput(".", "", { pattern: "中文" }),
      event("context", "\uFEFFfirst\r\n", 1), event("match", "中文\r\n", 2), event("context", "last\r", 3));
    const read = readText(source, true);
    expect(data.rows.map(({ path: _path, match: _match, ...row }) => row)).toEqual(read.rows);
    expect(data.rows.map(row => row.match)).toEqual([false, true, false]);
    expect(grepToModel(data)).toContain(`2#${read.rows[1].hash}│中文`);
    expect(searchSummary(data)).toMatchObject({ returned: 3, matches: 1, excerpts: 0, complete: true });
    // 有上下文时文件标题列出命中行号，模型无需靠位置推断哪一行是命中。
    expect(grepToModel(data)).toContain('"file.txt" · 1 matching line: 2');
  });

  // 压缩 JS/SVG 的单行可达数百 KiB；命中必须可见，片段围绕命中而非行首，rg 偏移是 UTF-8 字节；锚点按完整行计算，片段不能产生假锚点。
  it("超长命中行返回命中附近片段，按 UTF-8 字节偏移定位，锚点指向完整行", () => {
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
    // 全部是命中行时标题不重复列出行号。
    expect(model).toContain('"assets/file.txt" · 2 matching lines\n');
    // 行内只有窗口文字，范围在行外陈述，避免与正文混淆。
    expect(model).toContain(`1#${excerpt.hash}│中`);
    expect(model).toContain('"assets/file.txt" line 1 is an excerpt (characters 1880–2280 of 4003); its anchor refers to the complete line.');
  });

  // 上下文长行没有命中可居中，从行首截取；片段不能被计成命中，也不占命中行上限。
  it("超长上下文行从行首截取，且不占命中行上限", () => {
    const data = collect(grepOutput(".", "", { pattern: "found", limit: 1, context: 1 }),
      event("context", `${'"'.repeat(40 * 1024)}\n`, 1), event("match", "found\n", 2));
    expect(data.rows.map(row => [row.excerpt !== null, row.line, row.match])).toEqual([[true, 1, false], [false, 2, true]]);
    expect(data.rows[0]).toMatchObject({ content: '"'.repeat(400), excerpt: { start: 0, length: 40 * 1024 } });
    expect(data.stopReason).toBeNull();
    expect(searchSummary(data)).toMatchObject({ returned: 2, matches: 1, excerpts: 1, complete: true });
    expect(grepToModel(data)).toContain(`characters 0–400 of ${40 * 1024}`);
  });

  // limit 只数命中行：上限前的命中保留完整后文；停在下一命中时，它已送达的前文不属于任何返回的命中，须裁掉。
  it("命中行上限不计上下文，停止时裁掉未返回命中的前文", () => {
    const data = collect(grepOutput(".", "", { pattern: "x", limit: 1, context: 1 }),
      event("context", "a\n", 1), event("match", "x\n", 2), event("context", "b\n", 3),
      event("context", "c\n", 5), event("match", "x\n", 6));
    expect(data.rows.map(row => row.line)).toEqual([1, 2, 3]);
    expect(data.stopReason).toBe("limit");
    expect(grepToModel(data)).toContain("Search stopped at the matching-line limit.");
  });

  // 正常行仅因剩余预算不足时应报告搜索停止，不应冒充单行超长后继续扫描。
  it("区分条数上限与累计字节上限，计数明确为已返回条目", () => {
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

  // 过大的管道记录尚未解析；即使空数组也只能说明未返回，不能宣称没有匹配或捏造定位。
  it("记录上限与空的字节截断结果都不会输出没有匹配", () => {
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

  // 空结果本身不是失败；正常读到 EOF 才能报告指定范围没有匹配。
  it("正常完成的空搜索仍明确报告没有匹配", () => {
    const grep = collect(grepOutput(".", "", { pattern: "." }));
    const find = collect(findOutput(".", "", 10));
    expect(searchSummary(grep)).toMatchObject({ complete: true, empty: "no_matches" });
    expect(grepToModel(grep)).toContain("No matching lines.");
    expect(findToModel(find)).toContain("No matching files.");
    const files = collect(grepOutput(".", "", { pattern: ".", outputMode: "files" }));
    expect(grepToModel(files)).toContain("No matching files.");
  });

  // rg 对非 UTF-8 输出 base64；替换字符会改变文件身份或伪造编辑锚点。
  it("解码合法 base64 正文，拒绝不可表示的路径或正文", () => {
    const output = grepOutput(".", "", { pattern: ".", anchored: false });
    const encode = (bytes: Buffer) => Buffer.from(`${JSON.stringify({
      type: "match", data: { path: { text: "a" }, lines: { bytes: bytes.toString("base64") }, line_number: 1 },
    })}\n`);
    output.records.push(encode(Buffer.from("中文\n")));
    expect(output.result.rows[0]).toMatchObject({ content: "中文", hash: null, excerpt: null });
    expect(() => output.records.push(encode(Buffer.from([0xff])))).toThrow(/not UTF-8/);
    expect(() => findOutput(".", "", 10).records.push(Buffer.from([0xff, 0]))).toThrow(/not UTF-8/);
  });

  // count 是原生的每文件命中行数；路径可以包含 LF，因此不能统一按行切分整条输出。
  it("文件模式和计数模式保留含分隔字符的路径与原生计数", () => {
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

  // EOF 中断是协议失败，区别于有明确原因的预算停止。
  it("残缺记录不能作为正常完成返回", () => {
    const records = new SearchRecords(10, () => null);
    records.push(Buffer.from('{"type":'));
    expect(() => records.finish()).toThrow(/incomplete/);
  });
});

describe("搜索参数与分发路径", () => {
  // - 开头的模式与文件名不能成为选项，空格和 shell 标点保持一个 argv 参数。
  it("模式、glob 和目标按 argv 传递，隔离用户 rg 配置", () => {
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

  // spawn 不读取 asar 虚拟路径；同时覆盖 Windows 分隔符，普通目录名不应被误改。
  it("仅改写归档路径段，跨平台定位解包可执行文件", () => {
    expect(executablePath("/app/app.asar/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg"))
      .toBe("/app/app.asar.unpacked/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg");
    expect(executablePath("C:\\app\\app.asar\\node_modules\\rg.exe")).toBe("C:\\app\\app.asar.unpacked\\node_modules\\rg.exe");
    expect(executablePath("/project.asar.backup/rg")).toBe("/project.asar.backup/rg");
    expect(executablePath("/app/app.asar.unpacked/rg")).toBe("/app/app.asar.unpacked/rg");
  });
});

describe("搜索结果界面布局", () => {
  // 路径相对所选目标显示；单文件 grep 的行路径等于目标本身，去前缀后会变成空串。
  it("显示路径相对搜索目标，单文件目标保留文件名，前缀相同的兄弟目录不被误裁", () => {
    expect(displayPath(".", "src/a.ts")).toBe("src/a.ts");
    expect(displayPath("src", "src/lib/a.ts")).toBe("lib/a.ts");
    expect(displayPath("src/a.ts", "src/a.ts")).toBe("a.ts");
    expect(displayPath("src", "srcx/a.ts")).toBe("srcx/a.ts");
  });

  // rg 并行输出顺序不定，纯字符串排序会让根层文件插进子目录之间、同一目录被拆成多组。
  it("同一目录的条目连续成组，根层在前，预算在排序后截取", () => {
    const { groups, omitted } = groupByDirectory(["b/z.ts", "a.ts", "b/c/d.ts", "b/a.ts", "b.ts"], path => path, 4);
    expect(groups.map(group => [group.directory, group.entries.map(entry => entry.name)])).toEqual([
      ["", ["a.ts", "b.ts"]], ["b", ["a.ts", "z.ts"]],
    ]);
    expect(omitted).toBe(1);
  });

  // 片段起止若落在代理对中间，会留下孤立代理并显示为乱码。
  it("片段窗口不拆开代理对", () => {
    expect(excerptWindow("😀".repeat(1000), 1001)).toEqual({ start: 882, end: 1280 });
  });

  // 不连续行若并入同一段会被 CodeRows 连续编号，显示出错误的行号；长行片段与完整行一样参与连续分段，两端以省略号标出。
  it("文件内按行号排序，连续行合段，行号断开处分段，预算按文件独立", () => {
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

  // header 摘要不能把上下文行算成命中，也不能把行数当作文件数。
  it("content 摘要统计命中行与涉及文件，count 摘要合计每文件命中数", () => {
    const content = collect(grepOutput(".", "", { pattern: "x", context: 1 }),
      event("context", "a\n", 1), event("match", "x\n", 2), event("match", "x\n", 3));
    expect(searchSummary(content)).toMatchObject({ files: 1, matches: 2, complete: true });
    const counts = collect(grepOutput(".", "", { pattern: ".", outputMode: "count" }), Buffer.from("./a\0" + "2\n./b\0" + "10\n"));
    expect(searchSummary(counts)).toMatchObject({ files: 2, matches: 12, complete: true });
  });

  // 选项行只提示偏离默认值的参数；填充阶段的部分 JSON 可能含形状不明的字段。
  it("只列出非默认参数并忽略形状不明的字段", () => {
    expect(searchOptions({ pattern: "x", ignoreCase: true, literal: false, context: 0, limit: 500, outputMode: "content" })).toEqual([
      { kind: "flag", flag: "ignoreCase" },
    ]);
    expect(searchOptions({ outputMode: "count", context: 2, limit: 50, glob: ["*.ts", 3] })).toEqual([
      { kind: "mode", value: "count" }, { kind: "context", value: 2 }, { kind: "limit", value: 50 }, { kind: "glob", value: "*.ts" },
    ]);
    expect(searchOptions(null)).toEqual([]);
    // 空结果提示只列出仍生效的筛选；两者都已关闭时没有可提示的筛选。
    expect(searchFilters({})).toBe("both");
    expect(searchFilters({ hidden: true })).toBe("ignored");
    expect(searchFilters({ noIgnore: true })).toBe("hidden");
    expect(searchFilters({ hidden: true, noIgnore: true })).toBeNull();
  });
});
