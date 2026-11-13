import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuiltinApplicationService as ApplicationService } from "../testing.ts";
import { Directory } from "./contract.ts";

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

// Expectations distinguish opening existing material from creating a new on-disk project.
describe("Directory creation", () => {
  it("uses the directory name by default and trims a supplied title", async () => {
    const { root, service, sessionId } = open();
    const directory = join(root, "directory"); mkdirSync(directory);
    for (const title of [undefined, "  Materials  "]) {
      await service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
        input: { path: directory, ...(title ? { title } : {}) }, position: { x: 0, y: 0 } });
    }
    const snapshot = service.sessions.current(sessionId);
    const directories = snapshot.workbench.objects.filter(object => object.kind === Directory.kind);
    expect(directories.map(object => object.title)).toEqual(["directory", "Materials"]);
  });

  it("Directory creation rejects nonabsolute paths, missing directories, and regular files without leaving objects behind", async () => {
    const { root, service, sessionId } = open();
    const file = join(root, "file.txt"); writeFileSync(file, "text");
    for (const input of [{ path: "relative" }, { path: join(root, "missing") }, { path: file }]) {
      await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
        input, position: { x: 0, y: 0 } })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
    expect(service.sessions.current(sessionId).workbench.objects).toEqual([]);
  });

  it("creates a real project folder before binding its Directory resource", async () => {
    const { root, service, sessionId } = open();
    const path = join(root, "project");
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
      input: { path, mode: "new" }, position: { x: 0, y: 0 } });
    expect(statSync(path).isDirectory()).toBe(true);
    const directory = service.sessions.current(sessionId).workbench.objects.find(object => object.kind === Directory.kind)!;
    expect(directory.presentation.data).toEqual({ path });
  });

  it("rejects an occupied project name instead of opening or changing the existing project", async () => {
    const { root, service, sessionId } = open();
    const path = join(root, "project"); mkdirSync(path); writeFileSync(join(path, "keep.txt"), "existing work");
    await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
      input: { path, mode: "new" }, position: { x: 0, y: 0 } })).rejects.toMatchObject({ reason: "path_exists" });
    expect(readFileSync(join(path, "keep.txt"), "utf8")).toBe("existing work");
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });

  it("leaves missing parent folders uncreated and creates no resource", async () => {
    const { root, service, sessionId } = open();
    const parent = join(root, "missing");
    await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
      input: { path: join(parent, "project"), mode: "new" }, position: { x: 0, y: 0 } })).rejects.toMatchObject({ reason: "path_not_found" });
    expect(existsSync(parent)).toBe(false);
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });

  it("treats a broken symbolic link as an occupied project name", async () => {
    const { root, service, sessionId } = open();
    const path = join(root, "project"); symlinkSync(join(root, "missing"), path, "junction");
    await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "asterism.builtin/directory.create" },
      input: { path, mode: "new" }, position: { x: 0, y: 0 } })).rejects.toMatchObject({ reason: "path_exists" });
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });

});
