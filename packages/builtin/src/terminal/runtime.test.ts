import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { definePlugin, type PluginContext } from "@atelier/sdk/runtime";
import { pluginNamespace, type ChannelEnd, type ResourceRef } from "@atelier/sdk/contracts";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import { CloseTerminal, CreateTerminal, StartTerminal, TerminalChannel, type TerminalDown, type TerminalStatus, type TerminalUp } from "./contract.ts";

const apps: ApplicationService[] = [], roots: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(root?: string) {
  root ??= mkdtempSync(join(tmpdir(), "atelier-terminal-runtime-"));
  if (!roots.includes(root)) roots.push(root);
  let context!: PluginContext;
  const app = new ApplicationService(root, { plugins: [definePlugin({ namespace: pluginNamespace("test.terminal"), version: "1",
    setup(plugin) { context = plugin; return {}; } })] });
  apps.push(app);
  const home = join(root, "home"); mkdirSync(home, { recursive: true });
  app.configurePlugin({ type: "save", id: "atelier.builtin", value: { autoExpand: true, autoCollapse: true, shell: { selected: "test", profiles: [{
    id: "test", name: "Test", executable: "/bin/bash", args: [], commandArgs: [], env: { HOME: home, HISTFILE: join(home, "history") },
  }] } } });
  return { app, root, context };
}
/** 以 renderer 连接的方式打开终端通道：收集屏幕文本、最新状态与结束原因，并即时确认输出。 */
function view(app: ApplicationService, ref: ResourceRef) {
  const state = { text: "", status: null as TerminalStatus | null, end: null as ChannelEnd | null };
  let channel!: ReturnType<ApplicationService["sessions"]["channels"]["connect"]>;
  channel = app.sessions.channels.connect(TerminalChannel.id, ref, {
    deliver(raw) {
      const frame = raw as TerminalDown;
      if (frame.type === "reset") state.text = frame.data;
      else if (frame.type === "output") { state.text += frame.data; channel.receive({ type: "ack", chars: frame.data.length } satisfies TerminalUp); }
      else if (frame.type === "status") state.status = frame.status;
    },
    ended(end) { state.end = end; },
  });
  return { state, send: (message: TerminalUp) => channel.receive(message), close: () => channel.close({ reason: "closed" }) };
}

// 生命周期契约（资源对象是入口，实例是外部资源）：只有新建自动开启；回溯结束实例与通道；恢复同身份保持未开启；
// 关闭结束实例但保留资源，再次开启是新的 shell。
it.skipIf(!existsSync("/bin/bash"))("新建自动开启，回溯释放，恢复后未开启，关闭保留资源并可重新开启", async () => {
  const f = open(), sessionId = f.app.sessions.tree.create("Terminal");
  const session = f.context.session(sessionId);
  const ref = await session.create(CreateTerminal, { cwd: f.root });
  const createdAt = session.snapshot().position.nodeId;
  const first = view(f.app, ref);
  await expect.poll(() => first.state.status?.state, { timeout: 5000 }).toBe("idle");
  first.send({ type: "input", data: "export ATELIER_RUNTIME_VALUE=remembered; printf '\\nVALUE:%s\\n' \"$ATELIER_RUNTIME_VALUE\"\r" });
  await expect.poll(() => first.state.text, { timeout: 5000 }).toContain("VALUE:remembered");
  // 新挂载的视图先得到包含既有输出的快照。
  const second = view(f.app, ref);
  await expect.poll(() => second.state.text).toContain("VALUE:remembered");
  second.close();

  await f.app.sessions.execute({ type: "select", sessionId, nodeId: null });
  expect(first.state.end).toEqual({ reason: "removed" });
  expect(() => view(f.app, ref)).toThrow();

  await f.app.sessions.execute({ type: "select", sessionId, nodeId: createdAt });
  const restored = view(f.app, ref);
  await expect.poll(() => restored.state.status?.state).toBe("inactive");
  // 未开启时用户按键不启动 shell。
  restored.send({ type: "input", data: "echo ignored\r" });
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(restored.state.status?.state).toBe("inactive");

  await f.context.ipc.calls.invoke(StartTerminal, {}, { object: ref });
  await expect.poll(() => restored.state.status?.state, { timeout: 5000 }).toBe("idle");
  restored.send({ type: "input", data: "printf '\\nAFTER:%s\\n' \"${ATELIER_RUNTIME_VALUE-unset}\"\r" });
  await expect.poll(() => restored.state.text, { timeout: 5000 }).toContain("AFTER:unset");

  await f.context.ipc.calls.invoke(CloseTerminal, {}, { object: ref });
  expect(restored.state.status?.state).toBe("inactive");
  expect(restored.state.text).toBe("");
  expect(session.snapshot().resources.all().some(resource => resource.ref.id === ref.id)).toBe(true);
  expect(restored.state.end).toBeNull();

  session.remove(ref);
  expect(restored.state.end).toEqual({ reason: "removed" });
});

// 启动契约：持久身份和配置重新构造，软件重开不自动开启 shell，也不恢复旧输出。
it.skipIf(!existsSync("/bin/bash"))("软件重开保留资源但不开启实例", async () => {
  const f = open(), sessionId = f.app.sessions.tree.create("Terminal");
  const ref = await f.context.session(sessionId).create(CreateTerminal, { cwd: f.root });
  await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
  const reopened = open(f.root);
  const terminal = view(reopened.app, ref);
  await expect.poll(() => terminal.state.status?.state).toBe("inactive");
  expect(terminal.state.text).toBe("");
});
