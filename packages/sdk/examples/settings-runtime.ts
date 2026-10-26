import { definePlugin, implementCall } from "@asterism/sdk/runtime";
import { Settings, ReadLabel, settingsPlugin } from "./settings-contract.ts";

/** 没有功能模块的插件也能维护配置并提供全局业务调用。 */
export default definePlugin({
  namespace: settingsPlugin, version: "1.0.0",
  setup(plugin) {
    const settings = plugin.config(Settings);
    return { calls: [implementCall(ReadLabel, async () => settings.get().label)] };
  },
});
