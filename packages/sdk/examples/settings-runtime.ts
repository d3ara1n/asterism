import { definePlugin, implementCall } from "@asterism/sdk/runtime";
import { Settings, ReadLabel, settingsPlugin } from "./settings-contract.ts";

/** Plugins without feature modules can still maintain configuration and provide global business calls. */
export default definePlugin({
  namespace: settingsPlugin, version: "1.0.0",
  setup(plugin) {
    const settings = plugin.config(Settings);
    return { calls: [implementCall(ReadLabel, async () => settings.get().label)] };
  },
});
