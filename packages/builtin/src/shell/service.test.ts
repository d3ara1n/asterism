import { mkdtemp, rm, readFile, symlink, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { ShellService } from "./service.ts";
import { OUTPUT_CHAR_LIMIT, type ExecResult, type ShellSettings } from "./contract.ts";
import { resolveShell } from "./profiles.ts";

const roots: string[] = [], cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "atelier-shell-test-")); roots.push(root);
  const settings: ShellSettings = { selected: "test", profiles: [
    { id: "test", name: "Test executable", executable: process.execPath, args: [], commandArgs: ["-e"], env: { ATELIER_EXEC_TEST: "configured" } },
  ] };
  const closing = new AbortController();
  const instance = new ShellService(() => settings, closing.signal, root);
  const pending: ReturnType<ShellService["execute"]>[] = [];
  const service = { execute(...args: Parameters<ShellService["execute"]>) {
    const result = instance.execute(...args); pending.push(result); return result;
  } };
  cleanup.push(async () => { closing.abort(); await Promise.allSettled(pending); });
  return { root, service, settings, closing };
}

// docs/runtime.md：profile 决定真实程序及 argv；每次调用独立，目录仅为初始 cwd。
it("指定 profile 保留命令边界、cwd 与环境；普通失败保留退出码及输出", async () => {
  const { root, service } = await setup();
  const data: ExecResult[] = [];
  const result = await service.execute(root, { command:
    'console.log(JSON.stringify({cwd:process.cwd(),env:process.env.ATELIER_EXEC_TEST,text:"quotes \\" and $() `"})); process.exitCode=7' },
  { signal: new AbortController().signal, publish: value => data.push(value) });
  expect(result).toMatchObject({ kind: "failed", data: { termination: "exited", exitCode: 7, truncation: null } });
  expect(JSON.parse(result.data!.output)).toEqual({ cwd: await realpath(root), env: "configured", text: 'quotes " and $() `' });
  expect(data[0]?.termination).toBe("running");
});

// docs/runtime.md：启动 shell 正常退出后，刻意后台运行且重定向输出的程序继续存在。
it.skipIf(process.platform === "win32")("正常退出不终止命令启动的后台程序", async () => {
  const { root, service, settings } = await setup();
  settings.profiles[0]!.executable = "/bin/sh";
  settings.profiles[0]!.commandArgs = ["-c"];
  try {
    const result = await service.execute(root, {
      command: "sleep 30 >/dev/null 2>&1 </dev/null & echo $! > child.pid; cat child.pid",
    }, { signal: new AbortController().signal, publish() {} });
    expect(result).toMatchObject({ kind: "succeeded", data: { termination: "exited", exitCode: 0 } });
    const pid = Number(await readFile(join(root, "child.pid"), "utf8"));
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).not.toThrow();
  } finally {
    const pid = Number(await readFile(join(root, "child.pid"), "utf8").catch(() => ""));
    if (pid > 0) {
      try { process.kill(pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
  }
});

// docs/runtime.md：PATH 中找到的可执行文件不随资源 cwd 再次解析，npm 注入的相对 PATH 同样可用。
it.skipIf(process.platform === "win32")("相对 PATH 解析为绝对可执行文件，在另一 cwd 中仍能启动", async () => {
  const { root, service, settings } = await setup();
  const file = join(root, "test-shell");
  await symlink(process.execPath, file);
  settings.profiles[0]!.executable = "test-shell";
  settings.profiles[0]!.env.PATH = relative(process.cwd(), root);
  expect(await service.execute(tmpdir(), { command: 'console.log("resolved")' }, { signal: new AbortController().signal, publish() {} }))
    .toMatchObject({ kind: "succeeded", data: { shell: file, output: "resolved\n" } });
});

// docs/runtime.md：大输出只保留有界结果，临时文件供后续命令读取；数据经过真实管道与磁盘背压。
it("大量输出写临时文件，非零退出仍可用后续 exec 读取日志", async () => {
  const { root, service } = await setup();
  const invoke = (command: string) => service.execute(root, { command }, { signal: new AbortController().signal, publish() {} });
  const result = await invoke('process.stdout.write("x".repeat(2 * 1024 * 1024)); process.exitCode=2');
  expect(result).toMatchObject({ kind: "failed", data: { exitCode: 2, termination: "exited" } });
  expect(result.data!.output).toHaveLength(OUTPUT_CHAR_LIMIT);
  const file = result.data!.truncation!.file;
  expect((await readFile(file)).length).toBe(2 * 1024 * 1024);
  expect(await invoke(`console.log(require("node:fs").statSync(${JSON.stringify(file)}).size)`))
    .toMatchObject({ kind: "succeeded", data: { output: "2097152\n", truncation: null } });
});

// docs/runtime.md：超时杀进程并等待退出，已输出文本随终结保留。
it("执行期限终止真实进程，返回已产生输出与 timeout 原因", async () => {
  const { root, service } = await setup();
  const result = await service.execute(root, { command: 'console.log(process.pid); setInterval(()=>{},1000)', timeout: 0.5 },
    { signal: new AbortController().signal, publish() {} });
  expect(result).toMatchObject({ kind: "unknown", data: { termination: "timeout" } });
  const pid = Number(result.data!.output.trim());
  expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(pid, 0)).toThrow();
});

// docs/plugin-sdk.md：工具进度消费者失败仍归本次执行收束，不能从节流定时器逸出导致运行时崩溃。
it("异步进度发布失败终止进程并保留已有输出", async () => {
  const { root, service } = await setup();
  const result = await service.execute(root, { command: 'console.log(process.pid);setInterval(()=>{},1000)' }, {
    signal: new AbortController().signal,
    publish(data) { if (data.output) throw new Error("Progress delivery failed."); },
  });
  expect(result).toMatchObject({ kind: "unknown", data: { termination: "io_error" }, message: expect.stringContaining("Progress delivery failed") });
  expect(() => process.kill(Number(result.data!.output.trim()), 0)).toThrow();
});

// docs/runtime.md：用户取消贯穿同一进程组；真实子进程报告就绪后才发起取消。
it.skipIf(process.platform === "win32")("取消同时收束命令与其子进程", async () => {
  const { root, service } = await setup();
  const controller = new AbortController();
  const command = `const child=require("node:child_process").spawn(process.execPath,["-e","console.log(process.pid);setInterval(()=>{},1000)"],{stdio:["ignore","pipe","ignore"]});child.stdout.once("data",data=>console.log(JSON.stringify([process.pid,Number(data.toString())])));setInterval(()=>{},1000)`;
  const result = await service.execute(root, { command }, { signal: controller.signal, publish(data) {
    if (data.output.trim()) controller.abort();
  } });
  expect(result).toMatchObject({ kind: "unknown", data: { termination: "cancelled" } });
  const pids: number[] = JSON.parse(result.data!.output);
  await vi.waitFor(() => { for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow(); });
});

// docs/plugin-sdk.md：关闭信号结束在途工作；缺失可执行文件不会回退为另一种命令语法。
it("模块关闭取消执行，显式缺失 profile 报错且预取消不启动程序", async () => {
  const { root, service, closing, settings } = await setup();
  const running = service.execute(root, { command: 'console.log("ready");setInterval(()=>{},1000)' }, {
    signal: new AbortController().signal, publish(data) { if (data.output) closing.abort(); },
  });
  expect(await running).toMatchObject({ kind: "unknown", data: { termination: "cancelled", output: "ready\n" } });
  expect(await service.execute(root, { command: 'throw Error("unreachable")' }, { signal: closing.signal, publish() {} }))
    .toMatchObject({ kind: "cancelled" });
  settings.profiles[0]!.executable = join(root, "missing-shell");
  await expect(resolveShell(settings)).rejects.toThrow("no available executable");
});
