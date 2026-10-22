import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModule } from "@atelier/sdk/runtime";
import { ApplicationService } from "../../../../src/runtime/service.ts";
import * as pluginLoader from "../../../../src/plugins/loader.ts";

const roots: string[] = [], services: ApplicationService[] = [];
const loadPlugins = pluginLoader.loadPlugins;
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("人工命名入口", () => {

  // 插件装配契约：命名 setup 成功后其余模块失败，也不能泄漏可调用的半初始化接口。
  it("builtin 后续模块装配失败时拒绝人工命名，不覆盖标题或追加记录", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([builtin, ...external], host) => loadPlugins([
      { ...builtin!, modules: [...builtin!.modules ?? [], defineModule(() => { throw new Error("Setup failed."); })] },
      ...external,
    ], host));
    const root = mkdtempSync(join(tmpdir(), "atelier-naming-failed-")); roots.push(root);
    const service = new ApplicationService(root); services.push(service);
    const sessionId = service.sessions.tree.create("Unchanged");
    await expect(service.sessions.execute({ type: "rename", sessionId, title: "Rejected" })).rejects.toMatchObject({ code: "unavailable" });
    expect(service.sessions.tree.title(sessionId)).toBe("Unchanged");
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });
});

