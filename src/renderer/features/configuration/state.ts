import { runtime } from "../../runtime";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@asterism-app/sdk/contracts";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ConfigurationCommand, ConfigurationResult, ConfigurationSnapshot } from "../../../shared/configuration";
import { getI18n } from "../../shared/i18n";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { errorMessages } from "@asterism-app/ui/error-display";
import { toast } from "../../shared/toast";

type ConfigurationOperation = Exclude<ConfigurationCommand, { type: "read" }>;
type ConfigurationSuccess = Extract<ConfigurationResult, { ok: true }>;

/** Shared configuration snapshot and read errors; operation receipts update only successful snapshots, and feedback belongs to the initiating entry. */
export function useConfiguration(active: boolean) {
  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await runtime.configuration.execute({ type: "read" });
      if (result.ok) { setSnapshot(result.snapshot); setReadError(null); }
      else setReadError(errorDisplay(result.error));
    } catch { setReadError(errorMessages.unavailable); }
  }, []);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = runtime.configuration.onChanged(() => { void load(); });
    void load();
    return unsubscribe;
  }, [active, load]);
  const execute = useCallback(async (command: ConfigurationOperation): Promise<ConfigurationResult> => {
    const result = await runtime.configuration.execute(command);
    if (result.ok) { setSnapshot(result.snapshot); setReadError(null); }
    return result;
  }, []);
  return { snapshot, readError, load, execute };
}
export type ConfigurationState = ReturnType<typeof useConfiguration>;
export const ConfigurationContext = createContext<ConfigurationState | null>(null);
function useConfigurationContext(): ConfigurationState {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error("Configuration context is unavailable.");
  return value;
}

/** Read entries obtain only data and read state; configuration operations declare feedback ownership through useConfigurationAction. */
export function useSettingsConfiguration(): Pick<ConfigurationState, "snapshot" | "readError" | "load"> {
  const { snapshot, readError, load } = useConfigurationContext();
  return { snapshot, readError, load };
}

/**
 * Each form, section, or quick action holds its own instance; busy prevents reentry only at that entry.
 * For inline, the call site displays error; for toast, this hook displays it. The feedback channel is required.
 * run returns a success receipt, or null on failure or reentry; the selected channel has already handled failure feedback.
 */
export function useConfigurationAction(feedback: "inline" | "toast") {
  const { execute } = useConfigurationContext();
  const action = useSettingsAction(errorMessages.unavailable,
    feedback === "toast" ? message => toast.error(getI18n().text(message)) : undefined);
  const run = async (command: ConfigurationOperation): Promise<ConfigurationSuccess | null> => {
    const receipt = await action.run(async () => {
      const result = await execute(command);
      if (!result.ok) throw Object.assign(new Error(result.error.message), { display: errorDisplay(result.error) });
      return result;
    });
    return receipt?.value ?? null;
  };
  return { ...action, run };
}

/** Domain projections share the host transport without exposing unrelated configuration to their consumers. */
export function useShellSettings() {
  const { snapshot } = useConfigurationContext();
  return snapshot?.shell ?? null;
}
export function useMcpSettings() {
  const { snapshot } = useConfigurationContext();
  return snapshot?.mcp ?? null;
}
