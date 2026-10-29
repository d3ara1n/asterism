import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

// Expectations follow the directory creation contract: normalize titles and accept only actual directories.
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

});
