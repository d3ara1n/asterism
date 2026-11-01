import { useMemo } from "react";
import { ModelCatalog, type ModelCatalogSnapshot } from "@asterism-app/sdk/contracts";
import { useI18n, useRendererCalls, useRendererCatalogs, useRendererConfiguration } from "@asterism-app/sdk/renderer";
import { toast } from "sonner";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
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
  const action = useSettingsAction(settingsMessages.saveFailed,
    feedback === "toast" ? message => toast.error(i18n.text(message)) : undefined);
  const run = async (command: ConfigurationOperation) => {
    const receipt = await action.run(() => calls.invoke(UpdateParadigmConfiguration, command, {}));
    return receipt ? { ok: true as const, ...receipt.value } : null;
  };
  return { ...action, run };
}
