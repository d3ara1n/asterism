import type { Transition } from "motion/react";

/** Matches the public --ease-out curve. */
export const conversationEase = [0.2, 0.8, 0.2, 1] as const;
/** Short conversation animations, consistent with public --motion-fast / --ease-out. */
export const conversationTransition: Transition = { duration: 0.2, ease: conversationEase };
export const immediateTransition: Transition = { duration: 0 };
