import type { Transition } from "motion/react";

/** 编织动效参数：与 styles.css 的 --motion-* / --ease-out 保持一致。业务代码复用这些过渡，不另写时长与曲线。 */
export const easeOut = [0.2, 0.8, 0.2, 1] as const;
export const islandTransition: Transition = { duration: 0.42, ease: easeOut };
export const fadeTransition: Transition = { duration: 0.2, ease: easeOut };
