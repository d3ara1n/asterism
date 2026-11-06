import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { conversationTransition, immediateTransition } from "./motion";

/** Block header icon slot; a new `swapKey` crossfades the icon in place, and remounts show the current icon without replaying. */
export function IconSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion() === true;
  return <span className="relative inline-flex size-3.5 shrink-0" aria-hidden="true">
    <AnimatePresence initial={false}>
      <motion.span key={swapKey} className="absolute inset-0 inline-flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={reducedMotion ? immediateTransition : conversationTransition}>
        {children}
      </motion.span>
    </AnimatePresence>
  </span>;
}
