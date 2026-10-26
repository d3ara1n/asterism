import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useRendererCalls, useRendererEvents } from "@asterism/sdk/renderer";
import type { PluginCalls, EventSubscription } from "@asterism/sdk/contracts";
import { ReadUsage, UsageChanged } from "./contract";
import { ProviderUsageClient } from "./client";

/** 同一前端通信实例共享卡片缓存；最后一张卡片卸载时释放订阅和定时器。 */
const clients = new WeakMap<PluginCalls, { client: ProviderUsageClient; users: number; close(): void }>();
function acquire(calls: PluginCalls, events: ReturnType<typeof useRendererEvents>) {
  let shared = clients.get(calls);
  if (shared) { shared.users++; return shared; }
  const controller = new AbortController();
  const listeners = new Set<(id?: string) => void>();
  let subscription: EventSubscription | null = null;
  const subscribe = () => {
    if (subscription) return subscription;
    const current = events.subscribe(UsageChanged, { delivery: "latest", signal: controller.signal },
      ({ data }) => { for (const listener of listeners) listener(data.providerId ?? undefined); });
    subscription = current;
    void current.ready.catch(() => {});
    void current.closed.then(() => {
      if (controller.signal.aborted || subscription !== current) return;
      subscription = null;
      client.unavailable();
    });
    return current;
  };
  // 先完成事件订阅再读取，避免首次读取遗漏并发更新。
  const client = new ProviderUsageClient({
    async query(providerId, refresh) {
      await subscribe().ready;
      return calls.invoke(ReadUsage, { providerId, refresh }, { signal: controller.signal });
    },
    onChanged(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  const visibility = () => client.setActive(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", visibility);
  visibility();
  shared = { client, users: 1, close() {
    if (--this.users) return;
    controller.abort(); client.close(); clients.delete(calls);
    document.removeEventListener("visibilitychange", visibility);
  } };
  clients.set(calls, shared);
  return shared;
}

export function useProviderUsage(providerId: string | null) {
  const calls = useRendererCalls(), events = useRendererEvents();
  // 外部 store 的订阅由 React 管理；render 阶段不发请求或创建订阅。
  const store = useMemo(() => {
    let shared: ReturnType<typeof acquire> | undefined;
    return {
      subscribe(listener: () => void) {
        if (!providerId) return () => {};
        shared = acquire(calls, events);
        const release = shared.client.subscribe(providerId, listener);
        const captured = shared;
        return () => { release(); captured.close(); shared = undefined; };
      },
      get: () => providerId ? shared?.client.get(providerId) ?? null : null,
      refresh: () => providerId ? shared?.client.refresh(providerId) ?? Promise.resolve() : Promise.resolve(),
    };
  }, [calls, events, providerId]);
  const state = useSyncExternalStore(store.subscribe, store.get);
  const refresh = useCallback(() => store.refresh(), [store]);
  // 首次订阅后的同步重读由 useSyncExternalStore 完成。
  return { state, refresh };
}
