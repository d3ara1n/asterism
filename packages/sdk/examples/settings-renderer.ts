import { createElement, useState } from "react";
import { defineRendererPlugin, useRendererCalls, useRendererConfiguration, useRendererSettings } from "@asterism-app/sdk/renderer";
import { ReadLabel, Settings, settingsPlugin } from "./settings-contract.ts";

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
