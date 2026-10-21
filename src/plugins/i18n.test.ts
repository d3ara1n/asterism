import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { defineMessages, defineAction, pluginNamespace, withValues } from "@atelier/sdk/contracts";
import { z } from 'zod';
import { applyPreparation } from "./commands.ts";
import { PackageList, loadPackages, readManifest } from "./packages.ts";
import { loadCatalogs } from "./catalogs.ts";
import { MessageFormatter } from "../shared/i18n.ts";
import { ApplicationService } from "../runtime/service.ts";
import { dispatchPluginConfiguration, dispatchSession } from "../runtime/dispatch.ts";
import { pluginConfigurationResponseSchema, pluginConfigurationVersion } from "../shared/plugin-configuration.ts";
import { sessionResponseSchema, sessionVersion } from "../shared/session.ts";
import { PluginApiError } from "@atelier/sdk/runtime";
import * as sdkContracts from "@atelier/sdk/contracts";
import * as ReactIntl from "react-intl";
import { pathToFileURL } from "node:url";
const roots: string[] = [], services: ApplicationService[] = [];
const temp = () => { const root = mkdtempSync(join(tmpdir(), "atelier-i18n-")); roots.push(root); return root; };
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("插件目录与展示 IPC", () => {
  it("公共消息保留提供方归属，renderer 的 React Intl 来自宿主实例", async () => {
    const provider = temp(), consumer = temp(), data = temp(), cache = join(data, "cache");
    writeFileSync(join(provider, "package.json"), JSON.stringify({ name: "@example/messages", exports: { "./public": "./public.ts" },
      atelier: { id: "example.messages", api: { major: 13, minMinor: 0 }, i18n: { catalogs: { "zh-Hans": "zh.json" } } } }));
    writeFileSync(join(provider, "public.ts"), `import {pluginNamespace,defineMessages} from '@atelier/sdk/contracts';
      export const messages=pluginNamespace('example.messages').messages('en',defineMessages({title:{id:'title',defaultMessage:'Shared title'}}));`);
    writeFileSync(join(provider, "zh.json"), JSON.stringify({ title: "共享标题" }));
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "@example/consumer", dependencies: { "@example/messages": "*" },
      atelier: { id: "example.consumer", api: { major: 13, minMinor: 0 }, renderer: "renderer.ts" } }));
    writeFileSync(join(consumer, "renderer.ts"), `export {messages} from '@example/messages/public';
      export {IntlProvider, useIntl} from 'react-intl'; export default {modules:[{resources:[],cards:[],tools:[]}]};`);
    const list = new PackageList(join(data, "plugins.json"));
    for (const root of [provider, consumer]) list.add({ source: { kind: "path", path: root } }, data);
    const packages = await loadPackages(list, data, cache, []);
    expect(packages.map(item => item.status)).toEqual(["loaded", "loaded"]);
    const globals = globalThis as Record<string, unknown>, previous = globals.__atelierRendererModules;
    globals.__atelierRendererModules = { "@atelier/sdk/contracts": sdkContracts, "react-intl": ReactIntl };
    try {
      const renderer = await import(pathToFileURL(join(cache, packages[1]!.renderer!)).href);
      expect(renderer.IntlProvider).toBe(ReactIntl.IntlProvider); expect(renderer.useIntl).toBe(ReactIntl.useIntl);
      expect(renderer.messages.title.owner).toBe("example.messages");
      expect(new MessageFormatter("zh-Hans", packages[0]!.catalogs).text(renderer.messages.title)).toBe("共享标题");
    } finally { if (previous === undefined) delete globals.__atelierRendererModules; else globals.__atelierRendererModules = previous; }
  });
  it("无 renderer 的源码插件通过公开 SDK 声明消息与配置，目录内容独立更新", async () => {
    const root = temp(), data = temp(); mkdirSync(join(root, "locales"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@example/backend", atelier: { id: "example.backend", api: { major: 13, minMinor: 0 },
      runtime: "runtime.ts", i18n: { catalogs: { "zh-Hans": "locales/zh.json" } } } }));
    writeFileSync(join(root, "runtime.ts"), `import { z } from 'zod';
      import {pluginNamespace,defineMessages} from '@atelier/sdk/contracts';
      import { definePlugin, defineModule, PluginApiError } from '@atelier/sdk/runtime';
      const ns = pluginNamespace('example.backend');
      const messages = ns.messages('en', defineMessages({ limit: { id: 'limit', defaultMessage: 'Limit' } }));
      export default definePlugin({namespace: ns, version: '1', modules: [defineModule(plugin => {
        plugin.config(ns.config(z.object({limit: z.number().max(10)}).superRefine(value => {
          if (value.limit > 5) throw new PluginApiError('rejected', 'The limit exceeds the policy.', 'policy_limit', messages.limit);
        }), {limit: 3})); return {};
      })]});`);
    writeFileSync(join(root, "locales/zh.json"), JSON.stringify({ limit: "上限", broken: "{bad" }));
    const list = new PackageList(join(data, "plugins.json")); list.add({ source: { kind: "path", path: root } }, data);
    const [item] = await loadPackages(list, data, join(data, "cache"), []);
    expect(item!.status).toBe("loaded"); expect(item!.renderer).toBeUndefined(); expect(item!.catalogs![0]!.messages).toEqual({ limit: "上限" });
    const service = new ApplicationService(data, { plugins: [item!.definition!], catalogs: item!.catalogs }); services.push(service);
    const reply = pluginConfigurationResponseSchema.parse(dispatchPluginConfiguration(service, { kind: "plugin-configuration.request", version: pluginConfigurationVersion, id: randomUUID(), command: { type: "read" } })).result;
    if (!reply.ok) throw new Error("Configuration read failed.");
    expect(reply.configurations.find(item => item.id === "example.backend")!.value).toEqual({ limit: 3 });
    const rejected = pluginConfigurationResponseSchema.parse(dispatchPluginConfiguration(service, {
      kind: "plugin-configuration.request", version: pluginConfigurationVersion, id: randomUUID(),
      command: { type: "save", id: "example.backend", value: { limit: 6 } },
    })).result;
    if (rejected.ok) throw new Error("Expected policy rejection.");
    const title = rejected.error.display!;
    expect(title).toMatchObject({ owner: "example.backend", sourceLocale: "en", defaultMessage: "Limit" });
    expect(new MessageFormatter("zh-Hans", item!.catalogs).text(title)).toBe("上限");
    expect(new MessageFormatter("en", item!.catalogs).text(title)).toBe("Limit");
    writeFileSync(join(root, "locales/zh.json"), JSON.stringify({ limit: "最大数量" }));
    const [next] = await loadPackages(list, data, join(data, "cache"), []);
    expect(next!.catalogs![0]!.revision).not.toBe(item!.catalogs![0]!.revision);
    expect(new MessageFormatter("zh-Hans", next!.catalogs).text(title)).toBe("最大数量");
  });
  it("目录路径不能越过包根或符号链接，损坏翻译只诊断；清单规范化重复标签被拒绝", () => {
    const root = temp(), outside = temp(), diagnostics: string[] = [];
    writeFileSync(join(outside, "catalog.json"), "{}"); symlinkSync(join(outside, "catalog.json"), join(root, "linked.json"));
    expect(loadCatalogs(root, "example.test", { en: "linked.json", fr: "missing.json" }, message => diagnostics.push(message))).toEqual([]);
    expect(diagnostics.length).toBeGreaterThan(0);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", atelier: { id: "example.test", api: { major: 13, minMinor: 0 }, i18n: { catalogs: { en: "a.json", EN: "b.json" } } } }));
    expect(() => readManifest(root)).toThrow();
  });
  it("准备业务原因码和 display 穿过命令 IPC；无 display 自定义原因保留英文回退", async () => {
    const ns = pluginNamespace("example.counter"), messages = ns.messages("en", defineMessages({ limit: { id: "limit", defaultMessage: "Limit: {limit}" } }));
    const display = withValues(messages.limit, { limit: 20 });
    const action = defineAction(ns.resource("counter", z.object({})), { id: ns.name("change"), schema: z.object({}) });
    const fake = { sessions: { execute: async () => { applyPreparation(action, {}, {
      action: "reject", code: "limit_exceeded", message: "The count exceeds the limit.", display,
    }); } } } as unknown as ApplicationService;
    const request = { kind: "session.request", version: sessionVersion, id: randomUUID(), command: { type: "read", sessionId: "s" } };
    const result = sessionResponseSchema.parse(await dispatchSession(fake, request)).result;
    expect(result).toEqual({ ok: false, error: { code: "limit_exceeded", message: "The count exceeds the limit.", display } });
    fake.sessions.execute = async () => { throw new PluginApiError("rejected", "Custom reason.", "custom_reason"); };
    expect(sessionResponseSchema.parse(await dispatchSession(fake, request)).result).toEqual({ ok: false, error: { code: "custom_reason", message: "Custom reason.", display: "Custom reason." } });
  });
});
