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

// Contract basis: SDK origin stamps bind to operation handles; plugin assembly, real transactions, and close reuse host mechanisms.
describe("Event SDK and host boundaries", () => {

  it("later module failures clean up pending subscriptions and contracts from setup", async () => {
    let subscription!: EventSubscription;
    const broken = definePlugin({ namespace: ns, modules: [
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
