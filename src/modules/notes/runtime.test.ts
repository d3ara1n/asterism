import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "../../runtime/service.ts";
import * as runtimeModules from "../runtime.ts";
import { foldWorkbench } from "../../session/fold.ts";
import { flat } from "../../session/test-nodes.ts";
import type { SessionDataStore } from "../../session/data.ts";
import { Note, NoteContent } from "./contract.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open() {
  const root = mkdtempSync(join(tmpdir(), "resource-contract-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  return { root, service, sessionId: service.sessions.tree.create("Resource") };
}

// 预期来自笔记当前值契约；通用 SDK 数据校验与事务由宿主测试守护。
describe("笔记当前正文", () => {
  it("笔记具型状态支持空正文，缺失或损坏时卡片回退且工具不覆盖", async () => {
    let modules!: ReturnType<typeof runtimeModules.createModules>;
    let data!: SessionDataStore;
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
      data = args[0].data; modules = createModules(...args); return modules;
    });
    const { service, sessionId } = open();
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Note.kind, creation: { id: "atelier.core/note.create" }, input: {}, position: { x: 0, y: 0 } });
    const note = foldWorkbench(service.sessions.tree.timeline(sessionId).map(flat)).objects.find(object => object.kind === Note.kind)!;
    expect(note.title).toBe("Untitled note");
    expect(data.get(sessionId, note.id, NoteContent.id)).toEqual({ text: "" });
    expect(modules.resources.project(note).data).toEqual({ text: "" });
    const call = async (name: string, args: Record<string, never> | { content: string }) => {
      const invocation = modules.tools.match(note).find(tool => tool.tool.name === name)!.prepare(note, null, args);
      if (!("execute" in invocation)) throw new Error("Expected a tool invocation.");
      return invocation.execute(new AbortController().signal);
    };
    for (const value of [null, { text: 42 }]) {
      data.set(sessionId, note.id, NoteContent.id, value);
      expect(modules.resources.project(note).data).toEqual({ text: null });
      expect(await modules.resources.inspect(note)).toMatchObject({ title: "Untitled note", available: false, length: null });
      expect(await call("read", {})).toMatchObject({ kind: "rejected", error: { code: "note_unavailable" } });
      expect(await call("write", { content: "replacement" })).toMatchObject({ kind: "rejected", error: { code: "note_unavailable" } });
      expect(data.get(sessionId, note.id, NoteContent.id)).toEqual(value);
    }
  });

});
