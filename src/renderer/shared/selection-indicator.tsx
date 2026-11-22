import { motion } from "motion/react";
import { indicatorTransition } from "./weave/motion";

/**
 * Persistent selection fill that travels between the items sharing one layout identity instead of reappearing.
 * Place it first inside a relatively positioned item wrapper; the item itself is positioned so it paints above the fill.
 */
export function SelectionIndicator({ layoutId }: { layoutId: string }) {
  return <motion.span layoutId={layoutId} aria-hidden="true" transition={indicatorTransition}
    className="pointer-events-none absolute inset-0 rounded-md bg-selected" />;
}

/** Classes for an item drawn over the indicator: transparent while selected, so the travelling fill shows through. */
export const indicatorItem = (selected: boolean) => selected
  ? "relative bg-transparent text-selected-foreground hover:bg-transparent hover:text-selected-foreground dark:hover:bg-transparent"
  : "relative";
