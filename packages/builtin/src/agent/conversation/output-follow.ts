import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import type { VirtualizerHandle } from "virtua";
import { timelineKey, type TimelineItem } from "./timeline";

const followThreshold = 80;
const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/**
 * Follow state is local to the scroll area; successful business acceptance explicitly returns to the latest output.
 * The virtual list compensates for scroll position after measuring items; only scrolling caused by user gestures changes follow state.
 */
export function useOutputFollow(content: readonly TimelineItem[], processOwners: ReadonlyMap<string, string>, onUserGesture: () => void) {
  const follow = useRef(true);
  const gesture = useRef(false);
  const anchor = useRef<{ key: string; offset: number; focus?: boolean } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const list = useRef<VirtualizerHandle>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const toBottom = useCallback(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, []);
  const restore = useCallback(() => {
    if (follow.current) { toBottom(); return; }
    const saved = anchor.current;
    const virtualizer = list.current;
    if (!saved || !virtualizer || gesture.current) return;
    let index = content.findIndex(item => timelineKey(item) === saved.key);
    // When the process currently being read is automatically collapsed, navigate to its summary row.
    if (index < 0) {
      const owner = processOwners.get(saved.key);
      index = content.findIndex(item => timelineKey(item) === owner);
      if (index < 0) return;
      saved.key = timelineKey(content[index]!);
      saved.offset = 0;
    }
    virtualizer.scrollToIndex(index, { align: "start", offset: -saved.offset });
  }, [content, processOwners, toBottom]);
  const onProcessMount = useCallback((key: string, button: HTMLButtonElement) => {
    const saved = anchor.current;
    if (saved?.key !== key || !saved.focus) return;
    button.focus({ preventScroll: true });
    if (document.activeElement === button) saved.focus = false;
  }, []);
  useLayoutEffect(restore, [restore]);
  // The card takes over content-area wheel events during native bubbling, so React does not receive them; native listeners on the scroll element identify user gestures.
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const start = () => { gesture.current = true; anchor.current = null; onUserGesture(); };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const name of events) element.addEventListener(name, start, { passive: true });
    return () => { for (const name of events) element.removeEventListener(name, start); };
  }, [onUserGesture]);
  return {
    scroll, list, awayFromBottom, onProcessMount,
    /** After measurement, continues following output or preserves the user-selected item's position in the viewport. */
    onResize: restore,
    /** After a scroll ends, the next scroll must again originate from a user gesture to change follow state. */
    onScrollEnd() { gesture.current = false; },
    latest() {
      follow.current = true; setAwayFromBottom(false);
      anchor.current = null;
      toBottom();
    },
    /** Navigates by item index without requiring that item to be mounted. */
    jumpTo(index: number) {
      follow.current = false;
      gesture.current = false;
      anchor.current = content[index] ? { key: timelineKey(content[index]), offset: 0 } : null;
      list.current?.scrollToIndex(index, { align: "start" });
    },
    /** Remembers the trailing summary's position before expansion or collapse; the virtual list compensates for insertion, removal, and later measurement of items above it. */
    preserveItem(key: string) {
      const index = content.findIndex(item => timelineKey(item) === key);
      const virtualizer = list.current;
      if (index < 0 || !virtualizer) return;
      follow.current = false;
      gesture.current = false;
      anchor.current = { key, offset: virtualizer.getItemOffset(index) - (scroll.current?.scrollTop ?? virtualizer.scrollOffset), focus: true };
    },
    onScroll(event: UIEvent<HTMLDivElement>) {
      const away = distanceFromBottom(event.currentTarget) >= followThreshold;
      // Returning to the end restores following; leaving the end changes state only for user gestures, so measurement compensation does not disable following.
      if (gesture.current || !anchor.current) {
        if (!away) { follow.current = true; anchor.current = null; }
        else if (gesture.current) {
          follow.current = false;
          const virtualizer = list.current;
          if (virtualizer) {
            // The outer React scroll listener may run before the virtual list updates; read the current DOM position directly.
            const offset = event.currentTarget.scrollTop;
            const index = virtualizer.findItemIndex(offset);
            const item = content[index];
            if (item) anchor.current = { key: timelineKey(item), offset: virtualizer.getItemOffset(index) - offset };
          }
        }
      }
      setAwayFromBottom(away && !follow.current);
    },
  };
}
