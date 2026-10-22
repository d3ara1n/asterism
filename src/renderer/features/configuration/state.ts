import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@atelier/sdk/contracts";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ConfigurationCommand, ConfigurationResult, ConfigurationSnapshot } from "../../../shared/configuration";

export function useConfiguration(active: boolean) {
  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await window.host.configuration.execute({ type: "read" });
    if (result.ok) { setSnapshot(result.snapshot); setError(null); }
    else setError(errorDisplay(result.error));
  }, []);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = window.host.configuration.onChanged(() => { void load(); });
    void load();
    return unsubscribe;
  }, [active, load]);
  const run = useCallback(async (command: ConfigurationCommand): Promise<ConfigurationResult> => {
    setBusy(true); setError(null);
    try {
      const result = await window.host.configuration.execute(command);
      if (result.ok) setSnapshot(result.snapshot); else setError(errorDisplay(result.error));
      return result;
    } finally { setBusy(false); }
  }, []);
  return { snapshot, error, busy, load, run };
}
export type ConfigurationState = ReturnType<typeof useConfiguration>;
export const ConfigurationContext = createContext<ConfigurationState | null>(null);
export function useSettingsConfiguration(): ConfigurationState {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error("Configuration context is unavailable.");
  return value;
}
