import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import * as runtimeModules from "../../../../src/runtime/builtin.ts";
import { foldWorkbench } from "../../../../src/session/fold.ts";
import { flat } from "../../../../src/session/test-nodes.ts";
import type { SessionDataStore } from "../../../../src/session/data.ts";
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

// Expectations come from the note current-value contract; host tests cover generic SDK data validation and transactions.
describe("current note body", () => {
  it("typed note state supports an empty body; missing or corrupt state makes the card fall back and prevents tool overwrites", async () => {
    let modules!: ReturnType<typeof runtimeModules.createModules>;
    let data!: SessionDataStore;
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
      data = args[0].data; modules = createModules(...args); return modules;
    });
    const { service, sessionId } = open();
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Note.kind, creation: { id: "asterism.builtin/note.create" }, input: {}, position: { x: 0, y: 0 } });
    const note = foldWorkbench(service.sessions.tree.timeline(sessionId).map(flat)).objects.find(object => object.kind === Note.kind)!;
    expect(note.title).toBe("Untitled note");
    expect(data.get(sessionId, note.id, NoteContent.id)).toEqual({ text: "" });
    expect(modules.resources.project(note).data).toEqual({ text: "" });
    const call = async (name: string, args: Record<string, never> | { content: string }) => {
      const invocation = modules.tools.match(note).find(tool => tool.tool.name === name)!.prepare(note, null, args, { ref: { sessionId, id: "caller", kind: "test/agent" }, title: "Caller" });
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
