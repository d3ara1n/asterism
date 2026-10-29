import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };

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
