import { useEffect, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@asterism/sdk/renderer";
import type { StatusTone } from "@asterism/ui/ui/status";
import { McpChanged, ReadMcp, ReadMcpTools, type ConnectionPhase, type McpServerState, type McpToolSummary } from "./contract.ts";

export const phaseTone: Record<ConnectionPhase, StatusTone> = {
  connected: "success", connecting: "progress", awaiting_auth: "warning", error: "error", disconnected: "neutral",
};

/** 订阅模块状态事件，每次变化重新读取当前值。 */
function useMcpRead<T>(read: (signal: AbortSignal) => Promise<T>, enabled: boolean, deps: readonly unknown[]) {
  const events = useRendererEvents();
  const [value, setValue] = useState<T | undefined>(undefined), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const refresh = async () => {
      try { const result = await read(controller.signal); if (!controller.signal.aborted) { setValue(result); setError(null); } }
      catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)); }
    };
    const subscription = events.subscribe(McpChanged, { delivery: "latest", signal: controller.signal }, refresh);
    void subscription.ready.then(refresh).catch(failure => { if (!controller.signal.aborted) setError(String(failure)); });
    return () => { controller.abort(); subscription.close(); };
  }, [events, enabled, ...deps]);
  return { value, error };
}

export function useMcpStatus() {
  const calls = useRendererCalls();
  const { value, error } = useMcpRead<McpServerState[]>(signal => calls.invoke(ReadMcp, {}, { signal }), true, [calls]);
  return { servers: value ?? [], error };
}

/** 展开时才读取缓存目录摘要；undefined 表示尚未读到，null 表示该服务器还没有目录。 */
export function useMcpTools(serverId: string, enabled: boolean) {
  const calls = useRendererCalls();
  const { value, error } = useMcpRead<{ tools: McpToolSummary[]; instructions?: string } | null>(
    signal => calls.invoke(ReadMcpTools, { serverId }, { signal }), enabled, [calls, serverId]);
  return { directory: value, error };
}
