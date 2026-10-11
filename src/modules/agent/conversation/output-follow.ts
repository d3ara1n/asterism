import { useLayoutEffect, useRef, useState, type UIEvent } from "react";

/** 跟随状态局限于滚动区域；业务受理成功时显式回到最新输出。 */
export function useOutputFollow(content: unknown) {
  const follow = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  useLayoutEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [content]);
  return {
    scroll, awayFromBottom,
    latest() {
      follow.current = true; setAwayFromBottom(false);
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    },
    onScroll(event: UIEvent<HTMLDivElement>) {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setAwayFromBottom(!follow.current);
    },
  };
}
