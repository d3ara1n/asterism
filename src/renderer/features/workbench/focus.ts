import { useSyncExternalStore } from "react";
import { objectRetention } from "../session/retention";

/**
 * Focus: at most one object's content per session moves from its card into the focus island on the left of the workbench.
 * Focus identity is retained object state: released when the object leaves the current projection, preserved across session switches, and cleared on restart; content remounts as needed with the session frontend.
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
  // Update the table before discarding the old entry; the old entry's release has no effect because its identity no longer matches.
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

/** Fixed identity of the focus island; retain the island when switching sessions and change only its content. */
export const focusIslandId = "focus";

/** Move focus into the focus island on entry so the overflow viewport follows it. */
export function enterFocus(sessionId: string, objectId: string): void {
  setFocusedObject(sessionId, objectId);
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-island="${focusIslandId}"]`)?.focus({ preventScroll: true }));
}

/** When focus ends, return keyboard focus to the card's focus toggle; if the card is hidden, return it to the workbench island. */
export function exitFocus(sessionId: string, objectId: string): void {
  setFocusedObject(sessionId, null);
  requestAnimationFrame(() => {
    const toggle = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(objectId)}"] [data-object-focus]`);
    (toggle ?? document.querySelector<HTMLElement>(`[data-island="main-view"]`))?.focus({ preventScroll: true });
  });
}
