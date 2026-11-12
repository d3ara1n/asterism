import { useCallback, useEffect, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@asterism-app/sdk/renderer";
import { ReadUsage, UsageChanged, type ProviderUsageState } from "@asterism-app/sdk/contracts";
import { useLifetimeSignal } from "@asterism-app/ui/use-lifetime";

/** Matches the host cache freshness, so each poll finds the previous result expired. */
const pollInterval = 60_000;

/**
 * Reads the shared host cache for each provider on mount, on host change notifications, and every minute while `poll` holds
 * and the window is visible. Reads query only when the cache is missing or expired, so consumers reading the same provider
 * reuse one result. `refresh` forces a query for every provider and is the only read surfaced as `refreshing`.
 */
export function useProviderUsages(providerIds: readonly string[], poll: boolean) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const lifetime = useLifetimeSignal();
  const [states, setStates] = useState<ReadonlyMap<string, ProviderUsageState>>(() => new Map());
  const [refreshing, setRefreshing] = useState(false);
  const read = useCallback(async (providerId: string, refresh: boolean, signal: AbortSignal) => {
    try {
      const value = await calls.invoke(ReadUsage, { providerId, refresh }, { signal });
      if (!signal.aborted) setStates(previous => new Map(previous).set(providerId, value));
    } catch {
      if (!signal.aborted) setStates(previous => {
        const current = previous.get(providerId);
        return current ? new Map(previous).set(providerId, { ...current, state: "error", error: "unavailable" }) : previous;
      });
    }
  }, [calls]);
  const key = providerIds.join("\n");
  useEffect(() => {
    const ids = key ? key.split("\n") : [];
    if (!ids.length) return;
    const controller = new AbortController();
    const readAll = () => { for (const id of ids) void read(id, false, controller.signal); };
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      timer = poll && document.visibilityState === "visible" ? setInterval(readAll, pollInterval) : undefined;
    };
    const visibility = () => { if (document.visibilityState === "visible") readAll(); schedule(); };
    const subscription = events.subscribe(UsageChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => {
      for (const id of ids) if (data.providerId === null || data.providerId === id) void read(id, false, controller.signal);
    });
    void subscription.ready.then(() => {
      if (controller.signal.aborted) return;
      readAll(); schedule();
      if (poll) document.addEventListener("visibilitychange", visibility);
    }, () => {});
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [events, key, poll, read]);
  const refresh = () => {
    if (refreshing || !key) return;
    const signal = lifetime();
    setRefreshing(true);
    void Promise.all(key.split("\n").map(id => read(id, true, signal))).finally(() => { if (!signal.aborted) setRefreshing(false); });
  };
  return { states, refreshing, refresh };
}
