import { useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { failureDisplay } from "./error-display";

/** One settings entry owns pending and feedback. A receipt distinguishes successful void operations from failure or reentry. */
export function useSettingsAction(fallback: UiText, report?: (message: UiText) => void) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const run = async <T,>(work: () => Promise<T>): Promise<{ value: T } | null> => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true); setError(null);
    try { return { value: await work() }; }
    catch (failure) {
      const message = failureDisplay(failure, fallback);
      if (report) report(message); else setError(message);
      return null;
    } finally { pending.current = false; setBusy(false); }
  };
  return { run, busy, error };
}
