import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, loadPackages } from "./packages.ts";
import { MessageFormatter } from "../shared/i18n.ts";
import { ApplicationService } from "../runtime/service.ts";
import { servePluginConfiguration } from "../runtime/dispatch.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };
import * as sdkContracts from "@asterism-app/sdk/contracts";
import * as ReactIntl from "react-intl";
import { pathToFileURL } from "node:url";

const roots: string[] = [], services: ApplicationService[] = [];
const temp = () => { const root = mkdtempSync(join(tmpdir(), "asterism-i18n-")); roots.push(root); return root; };
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Plugin catalogs and presentation IPC", () => {
  it("public messages retain provider ownership and renderer React Intl comes from the host instance", async () => {
    const provider = temp(), consumer = temp(), data = temp(), cache = join(data, "cache");
    writeFileSync(join(provider, "package.json"), JSON.stringify({ name: "@example/messages", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, exports: { "./public": "./public.ts" },
      asterism: { displayName: "Test plugin", id: "example.messages", i18n: { catalogs: { "zh-Hans": "zh.json" } } } }));
    writeFileSync(join(provider, "public.ts"), `import {pluginNamespace,defineMessages} from '@asterism-app/sdk/contracts';
      export const messages=pluginNamespace('example.messages').messages('en',defineMessages({title:{id:'title',defaultMessage:'Shared title'}}));`);
    writeFileSync(join(provider, "zh.json"), JSON.stringify({ title: "共享标题" }));
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "@example/consumer", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, dependencies: { "@example/messages": "*" },
      asterism: { displayName: "Test plugin", id: "example.consumer", renderer: "renderer.ts" } }));
    writeFileSync(join(consumer, "renderer.ts"), `export {messages} from '@example/messages/public';
      export {IntlProvider, useIntl} from 'react-intl'; export default {modules:[{resources:[],cards:[],tools:[]}]};`);
    const list = new PackageList(join(data, "plugins.json"));
    for (const root of [provider, consumer]) list.add({ source: { kind: "path", path: root } }, data);
    const packages = await loadPackages(list, data, cache, []);
    expect(packages.map(item => item.status)).toEqual(["ready", "ready"]);
    const globals = globalThis as Record<string, unknown>, previous = globals.__asterismRendererModules;
    globals.__asterismRendererModules = { "@asterism-app/sdk/contracts": sdkContracts, "react-intl": ReactIntl };
    try {
      const renderer = await import(pathToFileURL(join(cache, packages[1]!.renderer!)).href);
      expect(renderer.IntlProvider).toBe(ReactIntl.IntlProvider); expect(renderer.useIntl).toBe(ReactIntl.useIntl);
      expect(renderer.messages.title.owner).toBe("example.messages");
      expect(new MessageFormatter("zh-Hans", packages[0]!.catalogs).text(renderer.messages.title)).toBe("共享标题");
    } finally { if (previous === undefined) delete globals.__asterismRendererModules; else globals.__asterismRendererModules = previous; }
  });
  it("source plugins without renderers declare messages and configuration through the public SDK with independently updated catalog content", async () => {
    const root = temp(), data = temp(); mkdirSync(join(root, "locales"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@example/backend", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` }, asterism: { displayName: "Test plugin", id: "example.backend",
      runtime: "runtime.ts", i18n: { catalogs: { "zh-Hans": "locales/zh.json" } } } }));
    writeFileSync(join(root, "runtime.ts"), `import { z } from 'zod';
      import {pluginNamespace,defineMessages} from '@asterism-app/sdk/contracts';
      import { definePlugin, defineModule, PluginApiError } from '@asterism-app/sdk/runtime';
      const ns = pluginNamespace('example.backend');
      const messages = ns.messages('en', defineMessages({ limit: { id: 'limit', defaultMessage: 'Limit' } }));
      export default definePlugin({namespace: ns, modules: [defineModule(plugin => {
        plugin.config(ns.config(z.object({limit: z.number().max(10)}).superRefine(value => {
          if (value.limit > 5) throw new PluginApiError('rejected', 'The limit exceeds the policy.', 'policy_limit', messages.limit);
        }), {limit: 3})); return {};
      })]});`);
    writeFileSync(join(root, "locales/zh.json"), JSON.stringify({ limit: "上限", broken: "{bad" }));
    const list = new PackageList(join(data, "plugins.json")); list.add({ source: { kind: "path", path: root } }, data);
    const [item] = await loadPackages(list, data, join(data, "cache"), []);
    expect(item!.status).toBe("ready"); expect(item!.renderer).toBeUndefined(); expect(item!.catalogs![0]!.messages).toEqual({ limit: "上限" });
    const service = new ApplicationService(data, { plugins: [item!.definition!], catalogs: item!.catalogs }); services.push(service);
    const reply = servePluginConfiguration(service, { type: "read" });
    if (!reply.ok) throw new Error("Configuration read failed.");
    expect(reply.configurations.find(item => item.id === "example.backend")!.value).toEqual({ limit: 3 });
    const rejected = servePluginConfiguration(service, { type: "save", id: "example.backend", value: { limit: 6 } });
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
});
