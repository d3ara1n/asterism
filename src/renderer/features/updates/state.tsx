import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UpdateState } from "../../../shared/updates";

type Operation = "check" | "set" | "install";
type Failure = { kind: "load" | "action"; detail: string };

function useUpdateService() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState<ReadonlySet<Operation>>(new Set());
  const inFlight = useRef(new Set<Operation>());

  useEffect(() => {
    let active = true;
    const accept = (value: UpdateState) => {
      if (!active) return;
      setState(value);
      setFailure(current => current?.kind === "load" ? null : current);
    };
    const stop = window.host.updates.onChanged(accept);
    void window.host.updates.get().then(accept).catch(error => {
      if (active) setFailure({ kind: "load", detail: String(error) });
    });
    return () => { active = false; stop(); };
  }, []);

  async function perform(operation: Operation, action: () => Promise<UpdateState | void>) {
    if (inFlight.current.has(operation)) return;
    inFlight.current.add(operation);
    setPending(new Set(inFlight.current));
    setFailure(null);
    try {
      const value = await action();
      if (value) setState(value);
    } catch (error) {
      setFailure({ kind: "action", detail: error instanceof Error ? error.message : String(error) });
    } finally {
      inFlight.current.delete(operation);
      setPending(new Set(inFlight.current));
    }
  }

  return {
    state, failure,
    checking: pending.has("check") || state?.status === "checking" || state?.status === "downloading",
    saving: pending.has("set"),
    installing: pending.has("install"),
    check: () => perform("check", () => window.host.updates.check()),
    set: (value: boolean) => perform("set", () => window.host.updates.set(value)),
    install: () => perform("install", () => window.host.updates.install()),
  };
}

const UpdatesContext = createContext<ReturnType<typeof useUpdateService> | null>(null);

/** The titlebar and settings page share one read and subscription; the main process owns update state. */
export function UpdatesProvider({ children }: { children: ReactNode }) {
  const updates = useUpdateService();
  return <UpdatesContext.Provider value={updates}>{children}</UpdatesContext.Provider>;
}

export function useUpdates() {
  const updates = useContext(UpdatesContext);
  if (!updates) throw new Error("UpdatesProvider is required.");
  return updates;
}
