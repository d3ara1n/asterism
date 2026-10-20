import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ProviderUsageState } from "./provider-usage.ts";

/** 消费者只能读取账户状态，不取得凭据；宿主按连接共享查询和刷新。 */
export interface RendererProviderUsage {
  get(providerId: string): ProviderUsageState | null;
  subscribe(providerId: string, listener: () => void): () => void;
  refresh(providerId: string): Promise<void>;
}
const Context = createContext<RendererProviderUsage | null>(null);
export const RendererProviderUsageProvider = Context.Provider;
export function useProviderUsage(providerId: string | null) {
  const service = useContext(Context);
  if (!service) throw new Error("Provider usage must be provided by the host.");
  const subscribe = useCallback((listener: () => void) => providerId ? service.subscribe(providerId, listener) : () => {}, [service, providerId]);
  const get = useCallback(() => providerId ? service.get(providerId) : null, [service, providerId]);
  const state = useSyncExternalStore(subscribe, get);
  const refresh = useCallback(() => providerId ? service.refresh(providerId) : Promise.resolve(), [service, providerId]);
  return { state, refresh };
}
