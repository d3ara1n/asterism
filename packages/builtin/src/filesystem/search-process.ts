import { spawn } from "node:child_process";
import { rgPath } from "@vscode/ripgrep";
import type { FindArgs, GrepArgs } from "@atelier/builtin-api/contracts";
import { FilesystemError, failed } from "./errors.ts";
import type { SearchRecords } from "./search-output.ts";
import type { SearchStopReason } from "./search-contract.ts";

/** Forge 解包后，OS 进程使用实体可执行文件路径；开发路径保持原样。 */
export function executablePath(path: string): string {
  return path.replace(/([\\/])([^\\/]+\.asar)(?=[\\/])/g, "$1$2.unpacked");
}

export function searchArguments(kind: "find" | "grep", args: FindArgs | GrepArgs, operand: string): string[] {
  const flags = ["--no-config", "--no-follow", "--no-require-git", "--color=never", "--path-separator=/"];
  if (args.hidden) flags.push("--hidden");
  if (args.noIgnore) flags.push("--no-ignore");
  if (kind === "find") flags.push("--files", "--null", "--glob", args.pattern);
  else {
    const grep = args as GrepArgs;
    if (grep.outputMode === "files") flags.push("--files-with-matches", "--null");
    else if (grep.outputMode === "count") flags.push("--count", "--null", "--with-filename");
    else flags.push("--json");
    flags.push("--encoding=none", "--line-number");
    if (grep.literal) flags.push("--fixed-strings");
    flags.push(grep.ignoreCase ? "--ignore-case" : "--case-sensitive");
    if (grep.word) flags.push("--word-regexp");
    if ((grep.outputMode ?? "content") === "content" && grep.context) flags.push("--context", String(grep.context));
    for (const glob of grep.glob ?? []) flags.push("--glob", glob);
    flags.push("--regexp", grep.pattern);
  }
  // 放在用户 glob 之后，隐藏／忽略开关也不会把 Git 元数据纳入递归搜索。
  flags.push("--glob", "!.git", "--", operand);
  return flags;
}

/** 单个 rg 子进程无 shell；取消或达到输出预算后结束进程，等待管道关闭再交付结果。 */
export async function runSearch(cwd: string, argv: string[], records: SearchRecords, signal: AbortSignal): Promise<SearchStopReason> {
  signal.throwIfAborted();
  return new Promise<SearchStopReason>((resolve, reject) => {
    const child = spawn(executablePath(rgPath), argv, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stopReason: SearchStopReason = null, fault: unknown, stderr = "";
    const stop = () => { child.kill("SIGKILL"); };
    const abort = () => stop();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      if (stopReason !== null || fault || signal.aborted) return;
      try {
        stopReason = records.push(chunk);
        if (stopReason !== null) stop();
      } catch (error) {
        fault = error instanceof FilesystemError ? error
          : new FilesystemError(failed("search_protocol", "The search process returned invalid output."));
        stop();
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(0, 16 * 1024); });
    child.on("error", error => {
      fault = new FilesystemError(failed("search_process", `The bundled ripgrep process could not run: ${error.message}`));
    });
    child.stdout.on("error", error => { fault = error; stop(); });
    child.stderr.on("error", error => { fault = error; stop(); });
    child.on("close", (code, termination) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) { reject(signal.reason); return; }
      if (fault) { reject(fault); return; }
      if (code === 2 || (stopReason === null && code !== 0 && code !== 1)) {
        reject(new FilesystemError(failed("search_failed", stderr.trim() || `ripgrep exited with code ${code}, signal ${termination}.`)));
        return;
      }
      try { if (stopReason === null) records.finish(); }
      catch (error) { reject(error); return; }
      resolve(stopReason);
    });
  });
}
