import { useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";

/** 跟随状态局限于滚动区域；业务受理成功时显式回到最新输出。 */
export function useOutputFollow(content: unknown) {
  const follow = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  useLayoutEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [content]);
  // 平滑输出在模型增量之后仍会改变高度，跟随实际布局直到尾部显示完毕。
  const contentRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {
    scroll, contentRef, awayFromBottom,
    latest() {
      follow.current = true; setAwayFromBottom(false);
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    },
    jumpTo(target: HTMLElement) {
      const viewport = scroll.current;
      if (!viewport || !viewport.contains(target)) return;
      follow.current = false;
      // 由浏览器处理画布变换，只滚动最近的对话视口。
      // Chromium 140 起支持 container，当前 DOM 类型尚未声明。
      const options: ScrollIntoViewOptions & { container: "nearest" } = {
        block: "start", inline: "nearest", behavior: "instant", container: "nearest",
      };
      target.scrollIntoView(options);
      const away = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight >= 80;
      follow.current = !away;
      setAwayFromBottom(away);
    },
    onScroll(event: UIEvent<HTMLDivElement>) {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setAwayFromBottom(!follow.current);
    },
  };
}
