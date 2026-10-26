import { createElement, useState } from "react";
import { defineRendererPlugin, useRendererCalls, useRendererConfiguration, useRendererSettings } from "@asterism/sdk/renderer";
import type { PluginCalls, ResourceRef } from "@asterism/sdk/contracts";
import { ReadLabel, Settings, settingsPlugin } from "./settings-contract.ts";
import { ReadState } from "./plugin-calls.ts";

function SettingsPage() {
  const settings = useRendererConfiguration(Settings);
  const calls = useRendererCalls();
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); setError(""); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  return createElement("div", null,
    createElement("p", null, settings.value.label),
    createElement("button", { disabled: !settings.ready || busy,
      onClick: () => { void run(() => settings.save({ label: "Custom label" })); } }, "Use custom label"),
    createElement("button", { disabled: busy,
      onClick: () => { void run(async () => { setLabel(await calls.invoke(ReadLabel, null, {})); }); } }, "Read current label"),
    createElement("p", null, label),
    error ? createElement("p", { role: "alert" }, error) : null);
}
export default defineRendererPlugin({ settings: { Body: SettingsPage, locations: ["general"] } });
export function OpenSettings() {
  const settings = useRendererSettings();
  return createElement("button", { onClick: () => settings.open(settingsPlugin.id, "general") }, "Open settings");
}
/** 对象和插件作用域的类型约束与后台校验保持一致。 */
export function invalidCalls(calls: PluginCalls, object: ResourceRef) {
  // @ts-expect-error 插件级调用不能虚构关联对象。
  void calls.invoke(ReadLabel, null, { object });
  // @ts-expect-error 对象级调用必须提供关联对象。
  void calls.invoke(ReadState, null, {});
}
