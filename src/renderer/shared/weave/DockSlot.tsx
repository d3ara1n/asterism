import { AnimatePresence } from "motion/react";
import type { ReactElement } from "react";
import { cn } from "@asterism-app/ui/utils";

/** A persistent flex slot animates reserved space while its fixed-width Dock stays clipped to that space. */
export function DockSlot({ side, className, children }: {
  side: "left" | "right"; className?: string; children: ReactElement | null;
}) {
  return <div className={cn("dock-slot", className)} data-side={side}
    style={{ width: children ? "calc(var(--dock-width) + var(--space-inset))" : 0 }}>
    <AnimatePresence initial={false}>{children}</AnimatePresence>
  </div>;
}
