import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { pluginNamespace, type EventSubscription } from "@asterism/sdk/contracts";
import { defineModule, definePlugin } from "@asterism/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { loadPlugins, type PluginHostServices } from "./loader.ts";

const ns = pluginNamespace("test.publisher");
const Update = ns.event("update", { schema: z.object({ value: z.number(), associated: z.string().optional() }), source: "any", semantics: { kind: "occurrence" } });
const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks(); });

// 契约依据：SDK 来源印记由操作柄绑定；插件装配、真实事务和关闭复用宿主机制。
describe("事件 SDK 与宿主边界", () => {

  it("后续模块失败会清理 setup 中的待建立订阅和契约", async () => {
    let subscription!: EventSubscription;
    const broken = definePlugin({ namespace: ns, version: "1", modules: [
      defineModule(plugin => { subscription = plugin.ipc.events.subscribe(Update, {}, () => {}); return { events: [Update] }; }),
      defineModule(() => { throw new Error("Setup failed."); }),
    ] });
    const host = { extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {} } as never,
      models: { list: () => [] } as never, log: () => {} } satisfies PluginHostServices;
    const loaded = loadPlugins([broken], host);
    try {
      expect(loaded.manifest[0]!.status).toBe("failed");
      expect(await subscription.closed).toMatchObject({ reason: "unavailable" });
      await expect(subscription.ready).rejects.toThrow();
      expect(() => loaded.events.contract(Update.id)).toThrow();
    } finally { await loaded.close(); }
  });

});
