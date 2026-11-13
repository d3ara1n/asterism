import type { ReactNode, Ref } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";

const pageVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 8 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0, 0, 0.2, 1] } },
  exit: (direction: number) => ({
    opacity: 0, x: direction * -8, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  } as const),
} as const;

/**
 * One page of a card that drills from a list into details. Render it as the keyed child of
 * AnimatePresence with mode="popLayout"; direction 1 moves forward into details and -1 returns.
 */
export function SlidePage({ children, direction, ref }: { children: ReactNode; direction: number; ref?: Ref<HTMLDivElement> }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <motion.div ref={ref} inert={!present} custom={direction}
    variants={pageVariants} initial={reducedMotion ? false : "enter"}
    animate={reducedMotion ? { opacity: 1, x: 0, transition: { duration: 0 } } : "center"}
    exit={reducedMotion ? { opacity: 0, x: 0, transition: { duration: 0 } } : "exit"}
    className="flex min-h-0 min-w-0 flex-1 flex-col">
    {children}
  </motion.div>;
}
