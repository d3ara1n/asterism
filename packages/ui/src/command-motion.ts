import { useLayoutEffect, useState, type CSSProperties } from "react";

/** Shared command-surface tokens, projected into CSS for Radix and reused by Motion and Web Animations. */
export const commandMotion = {
  enter: 0.18,
  exit: 0.12,
  resize: 0.15,
  page: 0.16,
  ease: [0.2, 0.8, 0.2, 1],
  exitEase: [0.4, 0, 1, 1],
  pageEase: [0, 0, 0.2, 1],
  enterScale: 0.96,
  exitScale: 0.97,
  enterOffset: 6,
  exitOffset: 4,
  pageOffset: 10,
} as const;

export const commandMotionStyle = {
  "--command-enter-duration": `${commandMotion.enter}s`,
  "--command-exit-duration": `${commandMotion.exit}s`,
  "--command-resize-duration": `${commandMotion.resize}s`,
  "--command-ease": `cubic-bezier(${commandMotion.ease.join(",")})`,
  "--command-exit-ease": `cubic-bezier(${commandMotion.exitEase.join(",")})`,
  "--command-enter-scale": commandMotion.enterScale,
  "--command-exit-scale": commandMotion.exitScale,
  "--command-enter-offset": `${commandMotion.enterOffset}px`,
  "--command-exit-offset": `${commandMotion.exitOffset}px`,
} as CSSProperties;

/** Hover cards and tooltips open a few pixels from their trigger; travel stays inside that gap so the surface never covers the trigger. */
export const hoverSurfaceMotionStyle = {
  ...commandMotionStyle,
  "--command-enter-offset": "3px",
  "--command-exit-offset": "2px",
} as CSSProperties;

export const commandResizeTransition = "height var(--command-resize-duration) var(--command-ease)";

/** Anchored surfaces move from their trigger; floating palettes use the same entry from above. */
export function commandSurfaceMotion(reducedMotion: boolean, side: "top" | "bottom" = "bottom") {
  const direction = side === "top" ? 1 : -1;
  return {
    initial: reducedMotion ? false as const : { opacity: 0, scale: commandMotion.enterScale, y: direction * commandMotion.enterOffset },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: {
      opacity: 0,
      scale: reducedMotion ? 1 : commandMotion.exitScale,
      y: reducedMotion ? 0 : direction * commandMotion.exitOffset,
      transition: { duration: reducedMotion ? 0 : commandMotion.exit, ease: commandMotion.exitEase },
    },
    transition: { duration: reducedMotion ? 0 : commandMotion.enter, ease: commandMotion.ease },
  };
}

export const commandPageVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * commandMotion.pageOffset }),
  center: {
    opacity: 1, x: 0, pointerEvents: "auto",
    transition: { type: "tween", duration: commandMotion.page, ease: commandMotion.pageEase },
  },
  exit: (direction: number) => ({
    opacity: 0, x: -direction * commandMotion.pageOffset, pointerEvents: "none",
    transition: { type: "tween", duration: commandMotion.exit, ease: commandMotion.exitEase },
  } as const),
} as const;

export const reducedCommandPageVariants = {
  enter: { opacity: 1, x: 0 },
  center: { opacity: 1, x: 0, pointerEvents: "auto", transition: { duration: 0 } },
  exit: { opacity: 0, x: 0, pointerEvents: "none", transition: { duration: 0 } },
} as const;

/** Natural content is measured independently of an animated shell, including virtualized viewports with explicit heights. */
export function useCommandContentHeight(page: string) {
  const [content, ref] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!content) { setHeight(undefined); return; }
    const measure = () => setHeight(content.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content, page]);
  return { ref, height };
}
