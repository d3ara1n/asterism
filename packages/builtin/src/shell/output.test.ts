import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { ShellOutputBuffer } from "./output.ts";
import { OUTPUT_CHAR_LIMIT, execToModel } from "./contract.ts";

// docs/runtime.md：字符按 Unicode 码点计；跨流 UTF-8 与控制序列不能污染正文，超限才产生临时日志。
it("流式解码、尾部预算与临时日志保留处理后的完整文本，提示只在模型投影中加入", async () => {
  const root = await mkdtemp(join(tmpdir(), "atelier-output-test-"));
  const output = new ShellOutputBuffer(root);
  try {
    const bytes = Buffer.from("首😀");
    await output.append("stdout", bytes.subarray(0, 4));
    await output.append("stderr", Buffer.from("\x1b[3"));
    await output.append("stdout", bytes.subarray(4));
    await output.append("stderr", Buffer.from("1m错误\x1b[0m\r"));
    await output.append("stderr", Buffer.from("\n"));
    // tput sgr0 的字符集复位可跨 chunk，终结字节 B 属于转义序列。
    await output.append("stdout", Buffer.from("\x1b("));
    await output.append("stdout", Buffer.from("B\x1b[0m"));
    expect(output.snapshot()).toEqual({ output: "首😀错误\n", truncation: null });
    expect(await readdir(root)).toEqual([]);
    const suffix = "中😀".repeat(OUTPUT_CHAR_LIMIT);
    for (let i = 0; i < suffix.length; i += 999) await output.append("stdout", Buffer.from(suffix.slice(i, i + 999)));
    const result = await output.finish();
    expect(Array.from(result.output)).toHaveLength(OUTPUT_CHAR_LIMIT);
    expect(result.output).toBe("中😀".repeat(OUTPUT_CHAR_LIMIT / 2));
    expect(result.truncation).toMatchObject({ totalChars: 5 + OUTPUT_CHAR_LIMIT * 2, retainedChars: OUTPUT_CHAR_LIMIT });
    expect(await readFile(result.truncation!.file, "utf8")).toBe(`首😀错误\n${suffix}`);
    expect(result.output).not.toContain("Output truncated");
    expect(execToModel({ ...result, shell: "/test/shell", termination: "exited", exitCode: 0, signal: null, durationMs: 100 }))
      .toContain(`[Output truncated: showing the last ${OUTPUT_CHAR_LIMIT} of ${5 + OUTPUT_CHAR_LIMIT * 2} Unicode characters. Full output: ${result.truncation!.file}]`);
  } finally { await output.close(); await rm(root, { recursive: true, force: true }); }
});
