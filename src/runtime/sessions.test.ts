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

// Plugin package management contract: change only package lists, taking effect after restart; built-ins are outside the manageable list.
it("application commands register and remove plugin packages and represent restart markers correctly", () => {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const dir = join(root, "pkg"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { id: "acme.p" } }));
  const added = service.execute({ type: "plugin.add", path: dir });
  expect(added.plugins.filter(p => p.index !== null).map(p => [p.source, p.status, p.enabled])).toEqual([[dir, "pending", true]]);
  expect(added.plugins.find(p => p.index === null)).toMatchObject({ id: "asterism.builtin", status: "loaded" });
  expect(added.restartRequired).toBe(true);
  expect(service.execute({ type: "plugin.remove", index: 0 }).restartRequired).toBe(false);
});
