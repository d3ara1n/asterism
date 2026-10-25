import { describe, expect, it } from "vitest";
import { readText } from "../shared/text.ts";
import { findOutput, grepOutput, SearchRecords } from "./search-output.ts";
import { findToModel, grepToModel, searchSummary } from "./search-presentation.ts";
import { executablePath, searchArguments } from "./search-process.ts";
import type { SearchStopReason } from "./search-contract.ts";

const event = (type: "match" | "context", text: string, line: number) => Buffer.from(`${JSON.stringify({
  type, data: { path: { text: "./file.txt" }, lines: { text }, line_number: line },
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
    expect(data.rows.map(({ path: _path, match: _match, kind: _kind, ...row }) => row)).toEqual(read.rows);
    expect(data.rows.map(row => row.match)).toEqual([false, true, false]);
    expect(grepToModel(data)).toContain(`2#${read.rows[1].hash}│中文`);
    expect(searchSummary(data)).toMatchObject({ returned: 3, matching: 1, omitted: 0, complete: true });
  });

  // 真实报告中的压缩 JS/SVG 命中被正文预算吞掉；匹配事实必须存在，省略内容不生成假锚点。
  it("超长命中行保留身份并继续搜索，完成状态与正文省略互不混淆", () => {
    const data = collect(grepOutput("assets", "assets", { pattern: "svg" }),
      event("match", `${"x".repeat(229 * 1024)}svg\n`, 1), event("match", "svg\n", 2));
    expect(data.rows[0]).toEqual({ kind: "omitted", path: "assets/file.txt", line: 1, match: true });
    expect(data.rows[1]).toMatchObject({ kind: "line", content: "svg", line: 2 });
    expect(searchSummary(data)).toMatchObject({ returned: 2, matching: 2, omitted: 1, complete: true, empty: null });
    const model = grepToModel(data);
    expect(model).toContain("2 rows returned (2 matching) · search complete");
    expect(model).toContain("1 — matching line; content omitted");
    expect(model).not.toContain("No matching");
    expect(model).not.toContain("1#");
  });

  // 预算按 JSON 字节计算，转义可让不足 64 KiB 的正文超限；上下文的省略不能被计成命中。
  it("转义后的超长上下文保留上下文身份，省略记录计入条数预算", () => {
    const data = collect(grepOutput(".", "", { pattern: "found", limit: 1 }),
      event("context", `${'"'.repeat(40 * 1024)}\n`, 1), event("match", "found\n", 2));
    expect(data.rows).toEqual([{ kind: "omitted", path: "file.txt", line: 1, match: false }]);
    expect(data.stopReason).toBe("limit");
    expect(searchSummary(data)).toMatchObject({ returned: 1, matching: 0, omitted: 1, complete: false });
    expect(grepToModel(data)).toContain("context line; content omitted");
    expect(grepToModel(data)).not.toContain("No matching");
  });

  // 正常行仅因剩余预算不足时应报告搜索停止，不应冒充单行超长后继续扫描。
  it("区分条数上限与累计字节上限，计数明确为已返回条目", () => {
    const exact = collect(findOutput(".", "", 1), Buffer.from("./a\0"));
    expect(exact.stopReason).toBeNull();
    const limited = collect(findOutput(".", "", 1), Buffer.from("./a\0./b\0"));
    expect(limited.stopReason).toBe("limit");
    expect(limited.files).toEqual(["a"]);
    expect(findToModel(limited)).toContain("1 file returned · search incomplete");
    expect(findToModel(limited)).toContain("result limit");
    const data = collect(grepOutput(".", "", { pattern: "." }),
      event("match", `${"a".repeat(40 * 1024)}\n`, 1), event("match", `${"b".repeat(30 * 1024)}\n`, 2));
    expect(data.stopReason).toBe("output_bytes");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].kind).toBe("line");
    expect(grepToModel(data)).toContain("Search stopped at the 64 KiB output budget.");
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
    expect(output.result.rows[0]).toMatchObject({ kind: "line", content: "中文", hash: null });
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
    expect(grepToModel(counts)).toContain("2 files returned · search incomplete");
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
