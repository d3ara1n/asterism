import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import type { VirtualizerHandle } from "virtua";

const followThreshold = 80;
const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/**
 * 跟随状态局限于滚动区域；业务受理成功时显式回到最新输出。
 * 虚拟列表测量条目后会自行补偿滚动位置，只有用户手势引起的滚动才改变跟随状态。
 */
export function useOutputFollow(content: unknown) {
  const follow = useRef(true);
  const gesture = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const list = useRef<VirtualizerHandle>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const toBottom = useCallback(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, []);
  useLayoutEffect(() => { if (follow.current) toBottom(); }, [content, toBottom]);
  // 卡片在原生冒泡阶段接管内容区滚轮，React 事件收不到；用户手势在滚动元素上以原生监听识别。
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const start = () => { gesture.current = true; };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const name of events) element.addEventListener(name, start, { passive: true });
    return () => { for (const name of events) element.removeEventListener(name, start); };
  }, []);
  return {
    scroll, list, awayFromBottom,
    /** 条目或视口尺寸变化（新块、流式增长、测量完成）后继续贴住末尾。 */
    onResize() { if (follow.current) toBottom(); },
    /** 一次滚动结束后，下一次滚动须重新由用户手势发起才改变跟随状态。 */
    onScrollEnd() { gesture.current = false; },
    latest() {
      follow.current = true; setAwayFromBottom(false);
      toBottom();
    },
    /** 按条目序号定位，不依赖该条目已挂载。 */
    jumpTo(index: number) {
      follow.current = false;
      list.current?.scrollToIndex(index, { align: "start" });
    },
    onScroll(event: UIEvent<HTMLDivElement>) {
      const away = distanceFromBottom(event.currentTarget) >= followThreshold;
      // 回到末尾即恢复跟随；离开末尾只在用户手势时生效，测量补偿造成的位移不关闭跟随。
      if (!away) follow.current = true;
      else if (gesture.current) follow.current = false;
      setAwayFromBottom(away && !follow.current);
    },
  };
}
