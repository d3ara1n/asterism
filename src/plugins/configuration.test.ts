import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineConfig, readConfig, pluginNamespace } from "@asterism-app/sdk/contracts";
import { definePlugin, type PluginConfig } from "@asterism-app/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { servePluginConfiguration } from "../runtime/dispatch.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Plugin configuration SDK and IPC integration", () => {
  // Backend values and IPC values have different representations; decoding a backend value twice breaks defaults and identity updates.
  it("encodes configuration files and IPC responses while updates and frontend reads use decoded values", () => {
    const ns = pluginNamespace("test.codec-config");
    const schema = z.codec(z.string().nullable(), z.object({ limit: z.number() }), {
      decode: value => ({ limit: value === null ? 0 : Number(value) }),
      encode: value => value.limit === 0 ? null : String(value.limit),
    });
    const contract = defineConfig(ns.id, schema, { limit: 2 });
    let handle!: PluginConfig<z.output<typeof schema>>;
    const root = mkdtempSync(join(tmpdir(), "plugin-config-codec-")); roots.push(root);
    const service = new ApplicationService(root, { plugins: [
      definePlugin({ namespace: ns, setup(plugin) { handle = plugin.config(contract); return {}; } }),
    ] }); services.push(service);
    const snapshot = () => {
      const result = servePluginConfiguration(service, { type: "read" });
      if (!result.ok) throw new Error(result.error.message);
      return result.configurations.find(item => item.id === ns.id)!;
    };
    expect(handle.get()).toEqual({ limit: 2 });
    expect(snapshot()).toMatchObject({ defaults: "2", value: "2", status: "defaults" });
    expect(readConfig(contract, snapshot().value).value).toEqual({ limit: 2 });
    expect(servePluginConfiguration(service, { type: "save", id: ns.id, value: { limit: 7 } })).toMatchObject({ ok: true });
    const file = join(root, "extensions", ns.id, ".asterism/config.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toBe("7");
    handle.update(value => value);
    expect(handle.get()).toEqual({ limit: 7 });
    expect(readConfig(contract, snapshot().value).value).toEqual({ limit: 7 });
    handle.update(() => ({ limit: 0 }));
    expect(JSON.parse(readFileSync(file, "utf8"))).toBeNull();
    expect(handle.get()).toEqual({ limit: 0 });
    expect(readConfig(contract, snapshot().value)).toEqual({ value: { limit: 0 }, status: "saved" });
    expect(servePluginConfiguration(service, { type: "reset", id: ns.id })).toMatchObject({ ok: true });
    expect(handle.get()).toEqual({ limit: 2 });
    expect(readConfig(contract, snapshot().value).value).toEqual({ limit: 2 });
  });
  it("configuration IPC lists only loaded plugins declaring configuration and shares current values with SDK reads/writes", async () => {
    const schema = z.strictObject({ limit: z.number().int() }), defaults = { limit: 1 };
    let handle!: PluginConfig<z.infer<typeof schema>>;
    const ns = pluginNamespace("acme.settings"), empty = pluginNamespace("acme.none");
    const plugins = [
      definePlugin({ namespace: ns, setup(plugin) { handle = plugin.config(defineConfig(ns.id, schema, defaults)); return {}; } }),
      definePlugin({ namespace: empty, modules: [] }),
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
