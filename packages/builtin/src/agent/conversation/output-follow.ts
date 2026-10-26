import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import type { VirtualizerHandle } from "virtua";
import { timelineKey, type TimelineItem } from "./timeline";

const followThreshold = 80;
const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/**
 * 跟随状态局限于滚动区域；业务受理成功时显式回到最新输出。
 * 虚拟列表测量条目后会自行补偿滚动位置，只有用户手势引起的滚动才改变跟随状态。
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
    // 正在阅读的过程被自动收起时，定位到这段过程的概要行。
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
  // 卡片在原生冒泡阶段接管内容区滚轮，React 事件收不到；用户手势在滚动元素上以原生监听识别。
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
    /** 测量后继续跟随输出，或保持用户选定条目在视口中的位置。 */
    onResize: restore,
    /** 一次滚动结束后，下一次滚动须重新由用户手势发起才改变跟随状态。 */
    onScrollEnd() { gesture.current = false; },
    latest() {
      follow.current = true; setAwayFromBottom(false);
      anchor.current = null;
      toBottom();
    },
    /** 按条目序号定位，不依赖该条目已挂载。 */
    jumpTo(index: number) {
      follow.current = false;
      gesture.current = false;
      anchor.current = content[index] ? { key: timelineKey(content[index]), offset: 0 } : null;
      list.current?.scrollToIndex(index, { align: "start" });
    },
    /** 展开／收起前记住末尾概要的位置；由虚拟列表补偿上方条目的插入、移除与后续测量。 */
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
      // 回到末尾即恢复跟随；离开末尾只在用户手势时生效，测量补偿造成的位移不关闭跟随。
      if (gesture.current || !anchor.current) {
        if (!away) { follow.current = true; anchor.current = null; }
        else if (gesture.current) {
          follow.current = false;
          const virtualizer = list.current;
          if (virtualizer) {
            // 外层 React scroll 监听可能早于虚拟列表更新，直接读取本次 DOM 位置。
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
