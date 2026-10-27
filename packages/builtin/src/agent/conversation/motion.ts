import type { Transition } from "motion/react";

/** Short conversation animations, consistent with public --motion-fast / --ease-out. */
export const conversationTransition: Transition = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] };
export const immediateTransition: Transition = { duration: 0 };
