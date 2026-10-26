import type { Transition } from "motion/react";

/** 对话短动效，与公共 --motion-fast / --ease-out 保持一致。 */
export const conversationTransition: Transition = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] };
export const immediateTransition: Transition = { duration: 0 };
