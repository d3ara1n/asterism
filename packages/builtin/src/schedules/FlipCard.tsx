import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const flipTransition = { duration: 0.5, ease: [0.3, 0, 0.2, 1] } as const;

function Face({ active, back, reduced, children }: { active: boolean; back?: boolean; reduced: boolean; children: ReactNode }) {
  // The hidden face stays mounted so its content survives the turn; inert removes it from focus and pointer input.
  return <motion.div inert={!active} className="absolute inset-0 flex flex-col [backface-visibility:hidden]"
    style={back && !reduced ? { rotateY: 180 } : undefined}
    initial={false} animate={reduced ? { opacity: active ? 1 : 0 } : undefined} transition={{ duration: 0.15 }}>
    {children}
  </motion.div>;
}

/** Two faces of one card: the front shows and controls the resource, the back edits it. Reduced motion crossfades. */
export function FlipCard({ flipped, front, back }: { flipped: boolean; front: ReactNode; back: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  return <div className="nodrag nopan relative min-h-0 flex-1 [perspective:1200px]">
    <motion.div className="absolute inset-0 [transform-style:preserve-3d]" initial={false}
      animate={reduced ? undefined : { rotateY: flipped ? 180 : 0 }} transition={flipTransition}>
      <Face active={!flipped} reduced={reduced}>{front}</Face>
      <Face active={flipped} back reduced={reduced}>{back}</Face>
    </motion.div>
  </div>;
}
