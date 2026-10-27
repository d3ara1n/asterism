import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { ShellOutputBuffer } from "./output.ts";
import { OUTPUT_CHAR_LIMIT, execToModel } from "./contract.ts";

// Characters are counted as Unicode code points; UTF-8 and control sequences spanning stream chunks must not corrupt text, and temporary logs are created only when the limit is exceeded.
it("streaming decoding, tail budgets, and temporary logs preserve the complete processed text, with notices added only in model projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "asterism-output-test-"));
  const output = new ShellOutputBuffer(root);
  try {
    const bytes = Buffer.from("首😀");
    await output.append("stdout", bytes.subarray(0, 4));
    await output.append("stderr", Buffer.from("\x1b[3"));
    await output.append("stdout", bytes.subarray(4));
    await output.append("stderr", Buffer.from("1m错误\x1b[0m\r"));
    await output.append("stderr", Buffer.from("\n"));
    // The character-set reset from tput sgr0 can span chunks; the final byte B belongs to the escape sequence.
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
      .toBe(`${result.output}\n\n[Output truncated: showing the last ${OUTPUT_CHAR_LIMIT} of ${5 + OUTPUT_CHAR_LIMIT * 2} Unicode characters. Full output: ${result.truncation!.file}]`);
  } finally { await output.close(); await rm(root, { recursive: true, force: true }); }
});
