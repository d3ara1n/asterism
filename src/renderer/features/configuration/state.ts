import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ConfigurationCommand, ConfigurationResult, ConfigurationSnapshot } from "../../../shared/configuration";
import { locale } from "../../shared/i18n";

export const s = (en: string, zh: string): string => locale === "zh" ? zh : en;
export function useConfiguration(active: boolean) {
  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    const result = await window.host.configuration.execute({ type: "read" });
    if (version !== generation.current) return;
    if (result.ok) { setSnapshot(result.snapshot); setError(null); }
    else setError(result.error.message);
  }, []);
  useEffect(() => {
    if (!active) return;
    void load();
    const unsubscribe = window.host.configuration.onChanged(() => { void load(); });
    return () => { generation.current++; unsubscribe(); };
  }, [active, load]);
  const run = useCallback(async (command: ConfigurationCommand): Promise<ConfigurationResult> => {
    setBusy(true); setError(null);
    ++generation.current;
    try {
      const result = await window.host.configuration.execute(command);
      ++generation.current;
      if (result.ok) setSnapshot(result.snapshot); else setError(result.error.message);
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
