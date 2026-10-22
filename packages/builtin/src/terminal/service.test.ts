import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellProfile } from "../shell/contract.ts";
import { ShellInstance } from "./service.ts";

const roots: string[] = [], instances: ShellInstance[] = [];
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hooks = { output() {}, resize() {}, changed() {} };
async function setup(executable: string, options: { start?: boolean; args?: string[]; env?: Record<string, string>; prepare?: (home: string) => Promise<void> } = {}) {
  const root = await mkdtemp(join(tmpdir(), "atelier-terminal-test-")); roots.push(root);
  const home = join(root, "home"); await mkdir(home);
  await options.prepare?.(home);
  const profile: ShellProfile = { id: "test", name: "Test", executable, args: options.args ?? [], commandArgs: [],
    env: { HOME: home, HISTFILE: join(home, "history"), LC_ALL: "C", ...options.env } };
  const instance = new ShellInstance({ cwd: root, profile: "test" }, () => ({ selected: "test", profiles: [profile] }),
    join(root, "integration"), hooks, { cols: 100, rows: 28 });
  instances.push(instance);
  if (options.start !== false) {
    await instance.start();
    expect(await instance.waitIdle(10, signal())).toBe("idle");
  }
  return { instance, root, home };
}
const signal = () => new AbortController().signal;

// 终端契约：同一 shell 的变量和 cwd 跨操作保留；Enter 后等待必须消费新的提示符，并报告上一命令退出码与目录。
describe.for(["/bin/zsh", "/bin/bash"].filter(existsSync))("真实交互 shell %s", executable => {
  it("保留变量与工作目录，等待前台命令实际完成并报告退出码", async () => {
    const { instance, root } = await setup(executable, { env: { ZDOTDIR: "" } });
    await mkdir(join(root, "child"));
    instance.write("sleep 0.2; export ATELIER_TEST_VALUE=remembered; cd child\r");
    expect(await instance.waitIdle(.03, signal())).toBe("timeout");
    expect(await instance.waitIdle(5, signal())).toBe("idle");
    expect(instance.status.cwd).toBe(join(root, "child"));
    instance.write("sleep 0.2; printf '\\nVALUE:%s DIR:%s\\n' \"$ATELIER_TEST_VALUE\" \"${PWD##*/}\"; false\r");
    expect(await instance.waitIdle(.03, signal())).toBe("timeout");
    expect(await instance.waitIdle(5, signal())).toBe("idle");
    expect(instance.status.lastExitCode).toBe(1);
    expect((await instance.read("history")).text).toContain("VALUE:remembered DIR:child");
    // 集成标记不泄漏到用户环境。
    instance.write("printf '\\nNONCE:%s\\n' \"${ATELIER_NONCE-unset}\"\r");
    expect(await instance.waitIdle(5, signal())).toBe("idle");
    expect((await instance.read("history")).text).toContain("NONCE:unset");
  });
});

// 登录 shell 契约：bash 登录模式忽略 --rcfile，集成脚本须按登录顺序读取 ~/.bash_profile，且仍报告状态。
it.skipIf(!existsSync("/bin/bash"))("bash 登录模式读取 bash_profile 并保持集成", async () => {
  const { instance } = await setup("/bin/bash", { args: ["-l"], prepare: home => writeFile(join(home, ".bash_profile"), "export ATELIER_LOGIN_VALUE=profile\n") });
  expect(instance.status.integration).toBe(true);
  instance.write("printf '\\nLOGIN:%s\\n' \"$ATELIER_LOGIN_VALUE\"\r");
  expect(await instance.waitIdle(5, signal())).toBe("idle");
  expect((await instance.read("history")).text).toContain("LOGIN:profile");
});

// zsh 契约：用户 .zshenv 改写 ZDOTDIR（XDG 布局）后，.zshrc 从新目录读取，集成仍生效。
it.skipIf(!existsSync("/bin/zsh"))("zsh 遵循用户 .zshenv 改写的 ZDOTDIR", async () => {
  const { instance } = await setup("/bin/zsh", { env: { ZDOTDIR: "" }, prepare: async home => {
    await mkdir(join(home, ".config", "zsh"), { recursive: true });
    await writeFile(join(home, ".zshenv"), 'ZDOTDIR="$HOME/.config/zsh"\n');
    await writeFile(join(home, ".config", "zsh", ".zshrc"), "export ATELIER_XDG_VALUE=loaded\n");
  } });
  expect(instance.status.integration).toBe(true);
  instance.write("printf '\\nXDG:%s\\n' \"$ATELIER_XDG_VALUE\"\r");
  expect(await instance.waitIdle(5, signal())).toBe("idle");
  expect((await instance.read("history")).text).toContain("XDG:loaded");
});

// 降级契约：不支持集成的 shell 仍可交互，等待明确报告 unsupported 而非挂起。
it.skipIf(!existsSync("/bin/sh"))("无集成 shell 立即就绪为未知状态", async () => {
  const { instance } = await setup("/bin/sh", { start: false });
  await instance.start();
  expect(instance.status).toMatchObject({ state: "unknown", integration: false });
  expect(await instance.waitIdle(1, signal())).toBe("unsupported");
});

// 终端契约：屏幕是解释控制序列后的网格；原始输出与截图使用同一状态来源。
it.skipIf(!existsSync("/bin/bash"))("处理覆盖、清屏与备用屏幕，保留原始控制字符", async () => {
  const { instance } = await setup("/bin/bash");
  instance.write("printf '\\033[?1049h\\033[2J\\033[Habc\\rXYZ'; sleep 1\r");
  await expect.poll(async () => (await instance.read("screen")).text.split("\n")[0], { timeout: 3000 }).toMatch(/^XYZ\s*$/);
  const image = await instance.image();
  expect(image.cells[0]!.slice(0, 3).map(cell => cell.text).join("")).toBe("XYZ");
  expect((await instance.read("raw")).text).toContain("\x1b[?1049h");
  instance.write("\x03");
  expect(await instance.waitIdle(5, signal())).toBe("idle");
});

// 终端契约：等待超时/取消不结束程序；结束实例清理实际服务器并释放监听端口。
it.skipIf(!existsSync("/bin/bash"))("等待取消后服务器继续运行，结束实例后释放端口", async () => {
  const { instance } = await setup("/bin/bash");
  const script = 'const net=require("net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>console.log("PORT="+s.address().port));';
  instance.write(`'${process.execPath}' -e '${script}'\r`);
  await expect.poll(() => instance.status.state, { timeout: 3000 }).toBe("running");
  let port = 0;
  await expect.poll(async () => {
    const output = (await instance.read("history")).text;
    port = Number(output.match(/^PORT=(\d+)\s*$/m)?.[1]); return port;
  }, { timeout: 3000 }).toBeGreaterThan(0);
  expect(await instance.waitIdle(.03, signal())).toBe("timeout");
  const controller = new AbortController();
  const waiting = instance.waitIdle(5, controller.signal);
  controller.abort(); await expect(waiting).rejects.toThrow();
  expect(await listening(port)).toBe(true);
  await instance.dispose();
  await expect.poll(() => listening(port), { timeout: 3000 }).toBe(false);
});
function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}
