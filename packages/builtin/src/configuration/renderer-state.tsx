import { useMemo, useRef, useState } from "react";
import { ModelCatalog, type ModelCatalogSnapshot, type UiText } from "@asterism-app/sdk/contracts";
import { useI18n, useRendererCalls, useRendererCatalogs, useRendererConfiguration } from "@asterism-app/sdk/renderer";
import { toast } from "sonner";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { BuiltinSettings, settingsMessages } from "../settings/contract";
import { UpdateParadigmConfiguration, type ConfigurationOperation, type ParadigmSnapshot } from "./contract";
import { resolveParadigmConfiguration } from "./state";

export type ConfigurationSnapshot = ModelCatalogSnapshot & ParadigmSnapshot;
export type ProviderModel = ModelCatalogSnapshot["models"][number];
export function useSettingsConfiguration() {
  const config = useRendererConfiguration(BuiltinSettings);
  const catalogs = useRendererCatalogs();
  const models = useMemo(() => catalogs.get(ModelCatalog), [catalogs]);
  const snapshot = useMemo<ConfigurationSnapshot | null>(() => config.ready && models
    ? { ...models, ...resolveParadigmConfiguration(config.value.paradigm) } : null, [config.ready, config.value.paradigm, models]);
  return { snapshot, readError: config.error ?? catalogs.error, load: config.refresh };
}
/** Each editor owns pending and feedback; the backend applies edits to the latest configuration. */
export function useConfigurationAction(feedback: "inline" | "toast") {
  const calls = useRendererCalls(), i18n = useI18n();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<UiText | null>(null);
  const run = async (command: ConfigurationOperation) => {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError(null);
    try { return { ok: true as const, ...await calls.invoke(UpdateParadigmConfiguration, command, {}) }; }
    catch (failure) {
      const message = failureDisplay(failure, settingsMessages.saveFailed);
      if (feedback === "inline") setError(message); else toast.error(i18n.text(message));
      return null;
    } finally { pending.current = false; setBusy(false); }
  };
  return { run, busy, error };
}
