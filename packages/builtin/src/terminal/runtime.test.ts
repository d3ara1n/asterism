import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { definePlugin, type PluginContext, type SessionResourcesChanged } from "@atelier/sdk/runtime";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import { CreateTerminal, ReadTerminal, WriteTerminal, TerminalResource } from "./contract.ts";

const apps: ApplicationService[] = [], roots: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(root?: string) {
  root ??= mkdtempSync(join(tmpdir(), "atelier-terminal-runtime-"));
  if (!roots.includes(root)) roots.push(root);
  let context!: PluginContext;
  const changes: Array<Pick<SessionResourcesChanged, "appeared" | "disappeared" | "initial">> = [];
  const app = new ApplicationService(root, { plugins: [definePlugin({ namespace: pluginNamespace("test.terminal"), version: "1",
    setup(plugin) { context = plugin; return { observers: [{ id: "presence", resourcesChanged(event) {
      changes.push({ appeared: event.appeared, disappeared: event.disappeared, initial: event.initial });
    } }] }; } })] });
  apps.push(app);
  const home = join(root, "home"); mkdirSync(home, { recursive: true });
  app.configurePlugin({ type: "save", id: "atelier.builtin", value: { autoExpand: true, autoCollapse: true, shell: { selected: "test", profiles: [{
    id: "test", name: "Test", executable: "/bin/bash", args: [], commandArgs: [], env: { HOME: home, HISTFILE: join(home, "history") },
  }] } } });
  return { app, root, context, changes };
}

// 存在性生命周期契约：回溯与显式移除均释放实例，恢复同身份时构造新 shell；查看变化不影响实例。
it.skipIf(!existsSync("/bin/bash"))("创建、回溯、恢复和移除覆盖终端实例寿命，常驻终端不占用时间线", async () => {
  const f = open(), sessionId = f.app.sessions.tree.create("Terminal");
  const session = f.context.session(sessionId);
  const ref = await session.create(CreateTerminal, { cwd: f.root });
  const createdAt = session.snapshot().position.nodeId;
  const read = () => f.context.ipc.calls.invoke(ReadTerminal, {}, { object: ref });
  await expect.poll(async () => (await read()).state, { timeout: 5000 }).toBe("idle");
  expect(f.changes.at(-1)).toMatchObject({ initial: false, appeared: [{ ref: { id: ref.id } }], disappeared: [] });
  await f.context.ipc.calls.invoke(WriteTerminal, { data: "export ATELIER_RUNTIME_VALUE=remembered\r" }, { object: ref });
  await expect.poll(async () => (await read()).state).toBe("idle");
  await f.app.sessions.execute({ type: "unwatch", sessionId });
  await f.context.ipc.calls.invoke(WriteTerminal, { data: "printf '\\nVALUE:%s\\n' \"$ATELIER_RUNTIME_VALUE\"\r" }, { object: ref });
  await expect.poll(async () => (await read()).serialized).toContain("VALUE:remembered");
  const view = await f.app.sessions.execute({ type: "read", sessionId });
  expect(view.kind === "view" && view.data.progress.busyObjectIds).toEqual([]);
  await f.app.sessions.execute({ type: "select", sessionId, nodeId: null });
  expect(f.changes.at(-1)).toMatchObject({ appeared: [], disappeared: [{ ref: { id: ref.id } }] });
  await expect(read()).rejects.toThrow();
  await f.app.sessions.execute({ type: "select", sessionId, nodeId: createdAt });
  await expect.poll(async () => (await read()).state, { timeout: 5000 }).toBe("idle");
  expect((await read()).serialized).not.toContain("VALUE:remembered");
  expect(f.changes.at(-1)).toMatchObject({ appeared: [{ ref: { id: ref.id } }], disappeared: [] });
  session.remove(ref);
  expect(f.changes.at(-1)).toMatchObject({ appeared: [], disappeared: [{ ref: { id: ref.id } }] });
});

// 启动契约：持久身份和配置重新构造，软件启动不自动恢复旧进程或输出；首次输入开启新 shell。
it.skipIf(!existsSync("/bin/bash"))("软件重开保留资源但保持未初始化，输入按需启动", async () => {
  const f = open(), sessionId = f.app.sessions.tree.create("Terminal");
  const ref = await f.context.session(sessionId).create(CreateTerminal, { cwd: f.root });
  await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
  const reopened = open(f.root);
  expect(reopened.changes).toContainEqual(expect.objectContaining({ initial: true, appeared: [expect.objectContaining({
    ref: { id: ref.id, kind: ref.kind, sessionId: ref.sessionId },
  })] }));
  const read = () => reopened.context.ipc.calls.invoke(ReadTerminal, {}, { object: ref });
  expect((await read()).state).toBe("inactive");
  expect(reopened.context.session(sessionId).snapshot().resources.get(TerminalResource, ref.id)?.status).toBe("known");
  await reopened.context.ipc.calls.invoke(WriteTerminal, { data: "printf '\\nREOPENED\\n'\r" }, { object: ref });
  await expect.poll(async () => (await read()).serialized, { timeout: 5000 }).toContain("REOPENED");
});
