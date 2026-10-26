import { animate, useMotionValue, useReducedMotion, type AnimationSequence } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { easeOut } from "../../shared/weave/motion";

/** 底板负责真实高度，内容保留展开尺寸；动画中断后从当前值继续，不把逐帧高度写回视图。 */
export function useObjectCollapse(collapsed: boolean, expandedHeight: number | undefined, resizing: boolean) {
  const header = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [mounted, setMounted] = useState(!collapsed);
  const [interactive, setInteractive] = useState(!collapsed);
  const height = useMotionValue(collapsed ? 0 : expandedHeight ?? 0);
  const opacity = useMotionValue(collapsed ? 0 : 1);
  const y = useMotionValue(collapsed ? 4 : 0);
  const initialized = useRef(false);
  const reducedMotion = useReducedMotion();
  const measuresHeader = expandedHeight !== undefined;

  useLayoutEffect(() => {
    const element = header.current;
    if (!element || !measuresHeader) return;
    const measure = () => setHeaderHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measuresHeader]);

  useLayoutEffect(() => {
    if (expandedHeight === undefined || headerHeight === null) return;
    const target = collapsed ? headerHeight : expandedHeight;
    if (!initialized.current || reducedMotion || resizing) {
      initialized.current = true;
      height.set(target);
      opacity.set(collapsed ? 0 : 1);
      y.set(collapsed ? 4 : 0);
      setMounted(!collapsed);
      setInteractive(!collapsed);
      return;
    }

    if (collapsed) setInteractive(false);
    else setMounted(true);
    const sequence: AnimationSequence = collapsed ? [
      [opacity, 0, { duration: 0.09, ease: "easeIn" }],
      [height, target, { type: "spring", duration: 0.24, bounce: 0.08 }],
    ] : [
      [height, target, { duration: 0.26, ease: easeOut }],
      [opacity, 1, { duration: 0.12, ease: easeOut }],
      [y, 0, { duration: 0.12, ease: easeOut, at: "<" }],
    ];
    const animation = animate(sequence);
    let cancelled = false;
    void animation.then(() => {
      if (cancelled) return;
      setMounted(!collapsed);
      setInteractive(!collapsed);
      if (collapsed) y.set(4);
    });
    return () => { cancelled = true; animation.stop(); };
  }, [collapsed, expandedHeight, headerHeight, resizing, reducedMotion, height, opacity, y]);

  return { header, headerHeight, height, opacity, y, mounted, interactive: interactive && !collapsed };
}
