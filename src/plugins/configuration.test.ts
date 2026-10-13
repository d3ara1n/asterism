import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineConfig, pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, type PluginConfig } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { dispatchPluginConfiguration } from "../runtime/dispatch.ts";
import { pluginConfigurationResponseSchema, pluginConfigurationVersion } from "../shared/plugin-configuration.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("插件配置的 SDK 与 IPC 接入", () => {
  it("只列出已声明配置的加载插件，保存与 SDK 共用值和校验，重开后持久化且插件隔离", async () => {
    const schema = z.strictObject({ limit: z.number().int().min(0).max(10).meta({ title: "Limit" }), enabled: z.boolean(), label: z.string() })
      .meta({ title: "Example settings", description: "Settings for this plugin." });
    const defaults = { limit: 1, enabled: true, label: "Initial" };
    const handles = new Map<string, PluginConfig<z.infer<typeof schema>>>();
    const plugins = ["acme.a", "acme.b", "acme.none"].map(id => definePlugin({ namespace: pluginNamespace(id), version: "1", modules: [defineModule(plugin => {
      if (id !== "acme.none") handles.set(id, plugin.config(defineConfig(id, schema, defaults)));
      return {};
    })] }));
    const root = mkdtempSync(join(tmpdir(), "plugin-config-")); roots.push(root);
    const service = new ApplicationService(root, { plugins }); services.push(service);
    const request = (command: unknown) => pluginConfigurationResponseSchema.parse(dispatchPluginConfiguration(service, {
      kind: "plugin-configuration.request", version: pluginConfigurationVersion, id: randomUUID(), command,
    })).result;
    const own = (result: ReturnType<typeof request>) => result.ok ? { ...result, configurations: result.configurations.filter(item => item.id.startsWith("acme.")) } : result;
    const read = own(request({ type: "read" }));
    expect(read).toMatchObject({ ok: true, configurations: [
      { id: "acme.a", schema: { title: "Example settings", properties: { limit: { title: "Limit" } } }, value: defaults, status: "defaults" },
      { id: "acme.b", value: defaults, status: "defaults" },
    ] });
    const saved = { limit: 0, enabled: false, label: "" };
    expect(request({ type: "save", id: "acme.a", value: saved })).toMatchObject({ ok: true });
    expect(handles.get("acme.a")!.get()).toEqual(saved);
    expect(handles.get("acme.b")!.get()).toEqual(defaults);
    expect(request({ type: "save", id: "acme.a", value: { ...saved, limit: 11 } })).toMatchObject({
      ok: false, error: { code: "invalid_request", message: expect.stringContaining("configuration.limit") },
    });
    expect(handles.get("acme.a")!.get()).toEqual(saved);
    expect(request({ type: "save", id: "missing.plugin", value: {} })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(request({ type: "save", id: "acme.none", value: {} })).toMatchObject({ ok: false, error: { code: "not_found" } });
    handles.get("acme.b")!.update(() => ({ ...defaults, limit: 4 }));
    expect(own(request({ type: "read" }))).toMatchObject({ ok: true, configurations: [
      { id: "acme.a", value: saved }, { id: "acme.b", value: { limit: 4 } },
    ] });
    await service.close(); services.splice(services.indexOf(service), 1);
    const reopened = new ApplicationService(root, { plugins }); services.push(reopened);
    expect(handles.get("acme.a")!.get()).toEqual(saved);
    expect(reopened.configurePlugin({ type: "reset", id: "acme.a" }).filter(item => item.id.startsWith("acme."))).toMatchObject([
      { id: "acme.a", value: defaults, status: "defaults" }, { id: "acme.b", value: { limit: 4 }, status: "saved" },
    ]);
    await reopened.close(); services.splice(services.indexOf(reopened), 1);
    expect(() => reopened.configurePlugin({ type: "read" })).toThrow(expect.objectContaining({ code: "unavailable" }));
  });
});
