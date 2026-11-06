import { motion, useIsPresent } from "motion/react";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { cn } from "@asterism-app/ui/utils";
import { fadeTransition, islandTransition } from "./motion";

/** A page-local surface outside the Island strip; its parent owns placement and visibility. */
export function Dock({ label, className, autoFocus, children, ref }: {
  label: string; className?: string; autoFocus?: boolean; children: ReactNode; ref?: Ref<HTMLElement>;
}) {
  const element = useRef<HTMLElement>(null);
  const present = useIsPresent();
  useEffect(() => { if (autoFocus) element.current?.focus({ preventScroll: true }); }, [autoFocus]);
  return <motion.section ref={node => {
    element.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }} tabIndex={-1} aria-label={label} inert={!present} aria-hidden={!present || undefined}
    className={cn("dock", className)}
    initial={{ opacity: 0, x: -16, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98, transition: fadeTransition }} transition={islandTransition}>
    <div className="island-backdrop" aria-hidden="true" />
    <div className="dock-body">{children}</div>
  </motion.section>;
}
