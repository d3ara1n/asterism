import type { Transition } from "motion/react";

/** Weave animation parameters: match --motion-* / --ease-out in styles.css. Business code reuses these transitions without separate durations or curves. */
export const easeOut = [0.2, 0.8, 0.2, 1] as const;
export const islandTransition: Transition = { duration: 0.42, ease: easeOut };
export const fadeTransition: Transition = { duration: 0.2, ease: easeOut };
/** Leaving content clears quickly so the arriving content reads as the subject; matches the command exit timing. */
export const exitTransition: Transition = { duration: 0.12, ease: [0.4, 0, 1, 1] };
/** A selection indicator travelling between items. */
export const indicatorTransition: Transition = { duration: 0.28, ease: easeOut };
