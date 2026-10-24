import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// 插件包管理契约：只改包列表，重启后生效；内置插件不在可管理列表中。
it("应用命令登记和移除插件包，正确表达重启标记", () => {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const dir = join(root, "pkg"); mkdirSync(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", atelier: { id: "acme.p", api: { major: 18, minMinor: 0 } } }));
  const added = service.execute({ type: "plugin.add", path: dir });
  expect(added.plugins.filter(p => p.index !== null).map(p => [p.source, p.status, p.enabled])).toEqual([[dir, "pending", true]]);
  expect(added.plugins.find(p => p.index === null)).toMatchObject({ id: "atelier.builtin", status: "loaded" });
  expect(added.restartRequired).toBe(true);
  expect(service.execute({ type: "plugin.remove", index: 0 }).restartRequired).toBe(false);
});
