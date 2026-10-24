import { useEffect, useRef } from "react";

/** 组件存续期间的取消信号：卸载时中止，入口发起的异步工作随之结束。 */
export function useLifetimeSignal(): () => AbortSignal {
  const lifetime = useRef<AbortController>(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  return () => lifetime.current.signal;
}
