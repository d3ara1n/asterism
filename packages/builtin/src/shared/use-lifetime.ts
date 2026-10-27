import { useEffect, useRef } from "react";

/** Cancellation signal for the component lifetime: aborts on unmount, ending asynchronous work initiated through its entry points. */
export function useLifetimeSignal(): () => AbortSignal {
  const lifetime = useRef<AbortController>(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  return () => lifetime.current.signal;
}
