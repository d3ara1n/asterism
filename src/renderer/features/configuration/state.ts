import { runtime } from "../../runtime";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@asterism-app/sdk/contracts";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ConfigurationCommand, ConfigurationResult, ConfigurationSnapshot } from "../../../shared/configuration";
import { getI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";

type ConfigurationOperation = Exclude<ConfigurationCommand, { type: "read" }>;
type ConfigurationSuccess = Extract<ConfigurationResult, { ok: true }>;

/** Shared configuration snapshot and read errors; operation receipts update only successful snapshots, and feedback belongs to the initiating entry. */
export function useConfiguration(active: boolean) {
  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const load = useCallback(async () => {
    const result = await runtime.configuration.execute({ type: "read" });
    if (result.ok) { setSnapshot(result.snapshot); setReadError(null); }
    else setReadError(errorDisplay(result.error));
  }, []);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = runtime.configuration.onChanged(() => { void load(); });
    void load();
    return unsubscribe;
  }, [active, load]);
  const execute = useCallback(async (command: ConfigurationOperation): Promise<ConfigurationResult> => {
    const result = await runtime.configuration.execute(command);
    if (result.ok) setSnapshot(result.snapshot);
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
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const run = async (command: ConfigurationOperation): Promise<ConfigurationSuccess | null> => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await execute(command);
      if (result.ok) return result;
      const message = errorDisplay(result.error);
      if (feedback === "inline") setError(message);
      else toast.error(getI18n().text(message));
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error };
}
