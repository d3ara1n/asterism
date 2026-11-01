import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };
import { applicationPackages } from "../plugins/distribution.ts";
import { applicationDirectory } from "../plugins/package-modules.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Bundled packages and user-added packages share the same persisted enablement and removal operations.
it("application commands register and remove plugin packages and represent restart markers correctly", () => {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const dir = join(root, "pkg"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { displayName: "Test plugin", id: "acme.p" } }));
  const added = service.execute({ type: "plugin.add", path: dir });
  expect(added.plugins.map(p => [p.source, p.status, p.enabled])).toEqual([["bundled:builtin", "pending", true], [dir, "pending", true]]);
  expect(added.plugins[0]).toMatchObject({ id: "asterism.builtin", index: 0, bundled: true });
  expect(added.restartRequired).toBe(true);
  expect(service.execute({ type: "plugin.remove", index: 1 }).restartRequired).toBe(false);
  expect(service.execute({ type: "plugin.enable", index: 0, enabled: false }).plugins[0]?.enabled).toBe(false);
});

// Removing a distribution entry must retain its recovery card without silently restoring persistence.
it("keeps removed bundled packages discoverable and adds them back through the ordinary loading list", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const removed = service.execute({ type: "plugin.remove", index: 0 });
  expect(removed.plugins).toHaveLength(1);
  expect(removed.plugins[0]).toMatchObject({
    source: "bundled:builtin", id: "asterism.builtin", index: null, bundled: true,
    status: "available", enabled: false, renderer: null,
    metadata: { name: { defaultMessage: "Asterism Essentials" }, description: { defaultMessage: "Agents, conversations, notes, files and interactive tools." } },
  });
  expect(removed.restartRequired).toBe(true);
  expect(applicationPackages(root).read()).toEqual([]);
  const restored = service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" });
  expect(restored.plugins).toHaveLength(1);
  expect(restored.plugins[0]).toMatchObject({ index: 0, enabled: true, status: "pending" });
  expect(applicationPackages(root).read()).toEqual([{ source: { kind: "bundled", name: "builtin" }, enabled: true }]);
  expect(restored.restartRequired).toBe(false);
});

// Recovery comes from the distribution, including when a user edits the file before startup.
it("discovers bundled packages absent from the saved list without shifting configured indices", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const dir = join(root, "external"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ asterism: { id: "acme.external", displayName: "External plugin" } }));
  applicationPackages(root).add({ source: { kind: "path", path: dir } }, root);
  const file = join(root, "plugins.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  saved.packages.splice(0, 1);
  writeFileSync(file, JSON.stringify(saved));
  const service = new ApplicationService(root); services.push(service);
  const snapshot = service.execute({ type: "workspace.read" });
  expect(snapshot.plugins.map(plugin => [plugin.source, plugin.index, plugin.status])).toEqual([
    [dir, 0, "pending"], ["bundled:builtin", null, "available"],
  ]);
  expect(snapshot.restartRequired).toBe(false);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(saved);
  const restored = service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" });
  expect(restored.restartRequired).toBe(true);
  expect(restored.plugins.map(plugin => [plugin.source, plugin.index])).toEqual([[dir, 0], ["bundled:builtin", 1]]);
  expect(service.execute({ type: "plugin.remove", index: 0 }).plugins.map(plugin => plugin.source)).toEqual(["bundled:builtin"]);
});

// The same plugin can be registered by path; recovery must respect plugin identity, not just source labels.
it("hides recovery for a bundled identity already added by path and rejects duplicate or unknown additions", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-plugin-")); roots.push(root);
  const list = applicationPackages(root);
  list.remove(0);
  list.add({ source: { kind: "path", path: applicationDirectory("packages/builtin") } }, root);
  const service = new ApplicationService(root); services.push(service);
  expect(service.execute({ type: "workspace.read" }).plugins).toHaveLength(1);
  expect(() => service.execute({ type: "plugin.add-bundled", source: "bundled:builtin" })).toThrow("already added");
  expect(() => service.execute({ type: "plugin.add-bundled", source: "bundled:missing" })).toThrow("No such bundled package");
  expect(list.read()).toHaveLength(1);
  expect(service.execute({ type: "plugin.remove", index: 0 }).plugins[0]).toMatchObject({ source: "bundled:builtin", status: "available" });
});
