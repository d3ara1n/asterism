import { useSyncExternalStore } from "react";
import { objectRetention } from "../session/retention";

/**
 * 聚焦：每个会话至多一个对象的内容从卡片移到工作台左侧的聚焦浮岛。
 * 聚焦身份是对象保留状态：随对象离开当前投影释放，切换会话后保持、重启后清空；内容随会话前端按需重新挂载。
 */
const focused = new Map<string, string>();
const listeners = new Set<() => void>();
const retentionKey = "asterism.host/focus";

export function focusedObject(sessionId: string): string | null {
  return focused.get(sessionId) ?? null;
}

export function setFocusedObject(sessionId: string, objectId: string | null): void {
  const previous = focusedObject(sessionId);
  if (previous === objectId) return;
  if (objectId) focused.set(sessionId, objectId); else focused.delete(sessionId);
  // 先改表再丢弃旧条目，旧条目的 release 因身份已不匹配而无效。
  if (previous) objectRetention.discard(sessionId, previous, retentionKey);
  if (objectId) objectRetention.get(sessionId, objectId, retentionKey, () => objectId, () => {
    if (focusedObject(sessionId) === objectId) setFocusedObject(sessionId, null);
  });
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useFocusedObject(sessionId: string | null): string | null {
  return useSyncExternalStore(subscribe, () => sessionId ? focusedObject(sessionId) : null);
}

/** 聚焦浮岛的固定身份；切换会话时浮岛保留，只交替其中内容。 */
export const focusIslandId = "focus";

/** 进入聚焦后焦点移入聚焦浮岛，让溢出视口跟随它。 */
export function enterFocus(sessionId: string, objectId: string): void {
  setFocusedObject(sessionId, objectId);
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-island="${focusIslandId}"]`)?.focus({ preventScroll: true }));
}

/** 结束聚焦后焦点回到卡片的聚焦切换按钮；卡片已隐藏时回到工作台浮岛。 */
export function exitFocus(sessionId: string, objectId: string): void {
  setFocusedObject(sessionId, null);
  requestAnimationFrame(() => {
    const toggle = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(objectId)}"] [data-object-focus]`);
    (toggle ?? document.querySelector<HTMLElement>(`[data-island="main-view"]`))?.focus({ preventScroll: true });
  });
}
