import { useEffect, useState } from "react";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import type { ReferenceTarget, ReferenceTargetProvider, RendererCalls } from "@asterism-app/sdk/renderer";
import { filterTargets } from "./reference-menu-model";

const searchDelayMs = 300;
const idle = { status: "idle" } as const;
const loading = { status: "loading" } as const;
type TargetState = typeof idle | typeof loading | { status: "error" }
  | { status: "ready"; items: readonly ReferenceTarget[]; limited: boolean };

/** Lists are loaded once per scope; only searches depend on query and composition. */
export function useReferenceTargets(provider: ReferenceTargetProvider | undefined, resource: ResourceRef | undefined,
  query: string, composing: boolean, calls: RendererCalls): TargetState {
  const searchQuery = provider?.kind === "search" ? query.trim() : "";
  const enabled = !!provider && !!resource && (provider.kind === "list" || (!composing && !!searchQuery));
  const [result, setResult] = useState<{ provider: ReferenceTargetProvider; resource: ResourceRef; query: string; state: TargetState }>();
  useEffect(() => {
    setResult(undefined);
    if (!enabled || !provider || !resource) return;
    const controller = new AbortController();
    const { signal } = controller;
    const run = async () => {
      const context = { resource, calls, signal };
      try {
        const data = provider.kind === "list" ? { items: await provider.list(context), limited: false }
          : await provider.search(searchQuery, context);
        if (!signal.aborted) setResult({ provider, resource, query: searchQuery, state: { status: "ready", ...data } });
      } catch {
        if (!signal.aborted) setResult({ provider, resource, query: searchQuery, state: { status: "error" } });
      }
    };
    const timer = provider.kind === "search" ? setTimeout(() => { void run(); }, searchDelayMs) : undefined;
    if (provider.kind === "list") void run();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [provider, resource, searchQuery, enabled, calls]);
  if (!enabled) return idle;
  if (!result || result.provider !== provider || result.resource !== resource || result.query !== searchQuery) return loading;
  const { state } = result;
  return state.status === "ready" && provider.kind === "list" ? { ...state, items: filterTargets(state.items, query) } : state;
}
