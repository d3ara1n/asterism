import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineConfig, pluginNamespace } from "@asterism/sdk/contracts";
import { definePlugin, type PluginConfig } from "@asterism/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { servePluginConfiguration } from "../runtime/dispatch.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Plugin configuration SDK and IPC integration", () => {
  it("configuration IPC lists only loaded plugins declaring configuration and shares current values with SDK reads/writes", async () => {
    const schema = z.strictObject({ limit: z.number().int() }), defaults = { limit: 1 };
    let handle!: PluginConfig<z.infer<typeof schema>>;
    const ns = pluginNamespace("acme.settings"), empty = pluginNamespace("acme.none");
    const plugins = [
      definePlugin({ namespace: ns, version: "1", setup(plugin) { handle = plugin.config(defineConfig(ns.id, schema, defaults)); return {}; } }),
      definePlugin({ namespace: empty, version: "1", modules: [] }),
    ];
    const root = mkdtempSync(join(tmpdir(), "plugin-config-")); roots.push(root);
    const service = new ApplicationService(root, { plugins }); services.push(service);
    const request = (command: unknown) => servePluginConfiguration(service, command);
    const read = request({ type: "read" });
    if (!read.ok) throw new Error("Expected configuration read.");
    expect(read.configurations.filter(item => item.id.startsWith("acme.")).map(item => item.id)).toEqual([ns.id]);
    expect(request({ type: "save", id: ns.id, value: { limit: 0 } })).toMatchObject({ ok: true });
    expect(handle.get()).toEqual({ limit: 0 });
    handle.update(() => ({ limit: 4 }));
    const updated = request({ type: "read" });
    if (!updated.ok) throw new Error("Expected configuration read.");
    expect(updated.configurations.find(item => item.id === ns.id)?.value).toEqual({ limit: 4 });
    expect(request({ type: "save", id: empty.id, value: {} })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
