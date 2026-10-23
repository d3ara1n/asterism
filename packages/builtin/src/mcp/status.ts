import { useEffect, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@atelier/sdk/renderer";
import { McpChanged, ReadMcp, type McpServerState } from "./contract.ts";

export function useMcpStatus() {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [servers, setServers] = useState<McpServerState[]>([]), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try { const result = await calls.invoke(ReadMcp, {}, { signal: controller.signal }); if (!controller.signal.aborted) { setServers(result); setError(null); } }
      catch (failure) { if (!controller.signal.aborted) setError(String(failure)); }
    };
    const subscription = events.subscribe(McpChanged, { delivery: "latest", signal: controller.signal }, refresh);
    void subscription.ready.then(refresh).catch(failure => { if (!controller.signal.aborted) setError(String(failure)); });
    return () => { controller.abort(); subscription.close(); };
  }, [calls, events]);
  return { servers, error };
}
