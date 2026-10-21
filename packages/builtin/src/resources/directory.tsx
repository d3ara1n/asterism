import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRendererCalls } from "@atelier/sdk/renderer";
import { ReadAgentCreations } from "@atelier/builtin-api/contracts";

interface CreationDirectory {
  readonly kinds: ReadonlyMap<string, string>;
  readonly failed: boolean;
}
const Directory = createContext<CreationDirectory | null>(null);

/** 创建入口随启动装配固定；整个前端共享一次读取，退出时取消在途调用。 */
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
