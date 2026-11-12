import { useEffect } from "react";
import { useAnimate, useReducedMotion } from "motion/react";

const durationMs = 700;

/** Animate only the remaining lifetime of a live notice; delayed mounts do not replay it. */
export function NoticeRipple({ at }: { at?: number }) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const reducedMotion = useReducedMotion() === true;
  useEffect(() => {
    if (at === undefined) return;
    const remaining = durationMs - (Date.now() - at);
    if (remaining <= 0 || reducedMotion || !scope.current) return;
    const fraction = Math.min(1, remaining / durationMs);
    const animation = animate(scope.current, { opacity: [0.7 * fraction, 0], scale: [1 + 0.02 * (1 - fraction), 1.02] },
      { duration: remaining / 1000, ease: "easeOut" });
    return () => { animation.stop(); };
  }, [at, reducedMotion, scope, animate]);
  return <span ref={scope} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] border border-warning" style={{ opacity: 0 }} />;
}
