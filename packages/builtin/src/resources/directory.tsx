import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRendererCalls } from "@asterism-app/sdk/renderer";
import { ReadAgentCreations } from "@asterism-app/builtin-api/contracts";

interface CreationDirectory {
  readonly kinds: ReadonlyMap<string, string>;
  readonly failed: boolean;
}
const Directory = createContext<CreationDirectory | null>(null);

/** Creation entry points are fixed during startup assembly; the entire frontend shares one read, and in-flight calls are canceled on exit. */
export function CreationDirectoryProvider({ children }: { children: ReactNode }) {
  const calls = useRendererCalls();
  const [directory, setDirectory] = useState<CreationDirectory>(() => ({ kinds: new Map(), failed: false }));
  useEffect(() => {
    const controller = new AbortController();
    setDirectory({ kinds: new Map(), failed: false });
    void calls.invoke(ReadAgentCreations, {}, { signal: controller.signal }).then(entries => {
      if (!controller.signal.aborted) setDirectory({ kinds: new Map(entries.map(entry => [entry.id, entry.resourceKind])), failed: false });
    }).catch(error => {
      if (controller.signal.aborted) return;
      console.error("Resource creation directory could not be loaded.", error);
      setDirectory({ kinds: new Map(), failed: true });
    });
    return () => controller.abort();
  }, [calls]);
  return <Directory.Provider value={directory}>{children}</Directory.Provider>;
}

export function useCreationDirectory(): CreationDirectory {
  const directory = useContext(Directory);
  if (!directory) throw new Error("Resource creation directory must be provided by the builtin renderer.");
  return directory;
}
