import { z } from "zod";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { definePlugin, type PluginStorageDeclaration } from "@atelier/sdk/runtime";

const ns = pluginNamespace("example.storage");
const schema = z.object({ greeting: z.string(), enabled: z.boolean() });
const Settings = ns.config(schema, { greeting: "Hello", enabled: true });

/** 无信封正文是第 0 版；每一步仅解释自己接收的历史形状。 */
const storage: readonly PluginStorageDeclaration[] = [{
  kind: "json", path: ".atelier/config.json", version: 2, unversioned: true,
  initial: () => Settings.defaults,
  migrations: {
    0: raw => {
      const old = z.object({ title: z.string() }).parse(raw);
      return { greeting: old.title };
    },
    1: raw => {
      const old = z.object({ greeting: z.string() }).parse(raw);
      return { ...old, enabled: true };
    },
  },
  validate: raw => schema.parse(raw),
}];

export default definePlugin({ namespace: ns, version: "1.0.0", storage,
  setup(plugin) {
    const settings = plugin.config(Settings);
    plugin.log.info(settings.get().greeting);
    return {};
  },
});
