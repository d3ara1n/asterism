import { z } from "zod";
import { defineCall, pluginNamespace } from "@asterism-app/sdk/contracts";

export const settingsPlugin = pluginNamespace("example.settings");
export const Settings = settingsPlugin.config(z.object({ label: z.string().min(1) }), { label: "Example" });
export const ReadLabel = defineCall(settingsPlugin.name("read-label"), {
  scope: "plugin", input: z.null(), output: z.string(),
});
