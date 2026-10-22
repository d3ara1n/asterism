import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalSession } from "./service.ts";

const roots: string[] = [], sessions: TerminalSession[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup(executable: string, start = true) {
  const root = await mkdtemp(join(tmpdir(), "atelier-terminal-test-")); roots.push(root);
  const home = join(root, "home"); await mkdir(home);
  const terminal = new TerminalSession({ cwd: root, profile: "test" }, () => ({ selected: "test", profiles: [{ id: "test", name: "Test",
    executable, args: [], commandArgs: [], env: { HOME: home, ZDOTDIR: home, HISTFILE: join(home, "history"), LC_ALL: "C" } }] }), root, () => {}, () => {});
  sessions.push(terminal);
  if (start) {
    await terminal.start();
    expect((await terminal.waitIdle(5, new AbortController().signal)).reason).toBe("idle");
  }
  return { terminal, root };
}
const signal = () => new AbortController().signal;

// 终端契约：同一 shell 的变量和 cwd 跨操作保留；Enter 后等待必须消费新的提示符。
describe.for(["/bin/zsh", "/bin/bash"].filter(existsSync))("真实交互 shell %s", executable => {
  it("保留变量与工作目录，并等待前台命令实际完成", async () => {
    const { terminal, root } = await setup(executable, false);
    await mkdir(join(root, "child"));
    await terminal.input("sleep 0.2; export ATELIER_TEST_VALUE=remembered; cd child\r", signal());
    expect((await terminal.waitIdle(.03, signal())).reason).toBe("timeout");
    expect((await terminal.waitIdle(5, signal())).reason).toBe("idle");
    await terminal.input("sleep 0.2; printf '\\nVALUE:%s DIR:%s\\n' \"$ATELIER_TEST_VALUE\" \"${PWD##*/}\"\r", signal());
    expect((await terminal.waitIdle(.03, signal())).reason).toBe("timeout");
    expect((await terminal.waitIdle(5, signal())).reason).toBe("idle");
    expect((await terminal.read("history")).text).toContain("VALUE:remembered DIR:child");
  });
});

// 终端契约：屏幕是解释控制序列后的网格；原始输出与截图使用同一状态来源。
it.skipIf(!existsSync("/bin/bash"))("处理覆盖、清屏与备用屏幕，保留原始控制字符", async () => {
  const { terminal } = await setup("/bin/bash");
  await terminal.input("printf '\\033[?1049h\\033[2J\\033[Habc\\rXYZ'; sleep 1\r", signal());
  await expect.poll(async () => (await terminal.read("screen")).text.split("\n")[0], { timeout: 3000 }).toMatch(/^XYZ\s*$/);
  const image = await terminal.image();
  expect(image.cells[0]!.slice(0, 3).map(cell => cell.text).join("")).toBe("XYZ");
  expect((await terminal.read("raw")).text).toContain("\x1b[?1049h");
  await terminal.input("\x03", signal());
  expect((await terminal.waitIdle(5, signal())).reason).toBe("idle");
});

// 终端契约：等待超时/取消不结束程序；移除实例清理实际服务器并释放监听端口。
it.skipIf(!existsSync("/bin/bash"))("等待取消后服务器继续运行，销毁实例后释放端口", async () => {
  const { terminal } = await setup("/bin/bash");
  const script = 'const net=require("net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>console.log("PORT="+s.address().port));';
  await terminal.input(`'${process.execPath}' -e '${script}'\r`, signal());
  await expect.poll(() => terminal.status.state, { timeout: 3000 }).toBe("running");
  let port = 0;
  await expect.poll(async () => {
    const output = (await terminal.read("history")).text;
    port = Number(output.match(/^PORT=(\d+)\s*$/m)?.[1]); return port;
  }, { timeout: 3000 }).toBeGreaterThan(0);
  expect((await terminal.waitIdle(.03, signal())).reason).toBe("timeout");
  const controller = new AbortController();
  const waiting = terminal.waitIdle(5, controller.signal);
  controller.abort(); await expect(waiting).rejects.toThrow();
  expect(await listening(port)).toBe(true);
  await terminal.dispose();
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
