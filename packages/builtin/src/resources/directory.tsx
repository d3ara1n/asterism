import { useSyncExternalStore } from "react";
import type { RendererPrepareContext } from "@asterism-app/sdk/renderer";
import { ReadAgentCreations } from "@asterism-app/builtin-api/contracts";

interface CreationDirectory { readonly kinds: ReadonlyMap<string, string>; readonly failed: boolean }
let directory: CreationDirectory = { kinds: new Map(), failed: false };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => directory;

/** The plugin owns the shared creation catalog and its frontend preparation lifetime. */
export async function prepareCreationDirectory({ calls, signal }: RendererPrepareContext): Promise<void> {
  try {
    const entries = await calls.invoke(ReadAgentCreations, {}, { signal });
    signal.throwIfAborted();
    directory = { kinds: new Map(entries.map(entry => [entry.id, entry.resourceKind])), failed: false };
  } catch (error) {
    if (signal.aborted) throw error;
    directory = { kinds: new Map(), failed: true };
    console.error("Resource creation directory could not be loaded.", error);
  }
  listeners.forEach(listener => listener());
}
export function useCreationDirectory(): CreationDirectory { return useSyncExternalStore(subscribe, snapshot); }
