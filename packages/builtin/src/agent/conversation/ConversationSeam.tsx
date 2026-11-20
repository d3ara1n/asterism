import type { ComponentProps } from "react";
import { cn } from "@asterism-app/ui/utils";

const lineBase = "h-px min-w-4 flex-1 transition-[background-color,box-shadow] duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none";
/**
 * Closed draws one rule; open splits it into two rules cast as shadows of a transparent line.
 * Hover always widens the gap by the same step regardless of state, so opening keeps widening and closing keeps narrowing under the pointer.
 * Zero-offset shadows are clipped by the border box, leaving only the center rule visible.
 */
const closedLine = "bg-border shadow-[0_0_0_var(--color-border),0_0_0_var(--color-border)] group-hover/seam:bg-transparent group-hover/seam:shadow-[0_-2px_0_var(--color-ring),0_2px_0_var(--color-ring)]";
const openLine = "bg-transparent shadow-[0_-4px_0_var(--color-border),0_4px_0_var(--color-border)] group-hover/seam:shadow-[0_-5px_0_var(--color-ring),0_5px_0_var(--color-ring)]";

/** A full-width rule interrupted by its label; interaction feedback stays on the rule and label instead of a filled surface. */
export function ConversationSeam({ open = false, className, children, ...props }: ComponentProps<"button"> & { open?: boolean }) {
  const line = cn(lineBase, open ? openLine : closedLine);
  return <button type="button" {...props} className={cn("group/seam relative flex h-8 w-full min-w-0 items-center gap-2 text-xs text-muted-foreground outline-none disabled:pointer-events-none", className)}>
    <span aria-hidden="true" className={line} />
    <span className={cn("flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5",
      "transition-[color,scale] duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none",
      "group-hover/seam:text-foreground group-active/seam:scale-[0.98] group-focus-visible/seam:ring-[3px] group-focus-visible/seam:ring-ring/50")}>
      {children}
    </span>
    <span aria-hidden="true" className={line} />
  </button>;
}
