import type { CSSProperties } from "react";
import type { UsageLevel } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";

const tones: Record<UsageLevel, string> = { available: "text-success", low: "text-warning", exhausted: "text-destructive" };
/** Core, transparent gap, then a thin translucent ring, all in the current color; the gap stays true on any background. */
const lamp: CSSProperties = {
  background: "radial-gradient(circle, currentColor 0 2.6px, transparent 3px 4px, color-mix(in oklab, currentColor 40%, transparent) 4.2px 5.6px, transparent 6px)",
};
const glow: CSSProperties = { filter: "drop-shadow(0 0 3px color-mix(in oklab, currentColor 70%, transparent))" };

/** A signal lamp in the level color with a soft glow; without a level it is unlit: muted and without glow. The glow extends 3px past its box. */
export function SignalDot({ level, className }: { level: UsageLevel | null; className?: string }) {
  return <span aria-hidden="true" style={level ? { ...lamp, ...glow } : lamp}
    className={cn("block size-3 shrink-0 rounded-full transition-[color,filter] duration-200", level ? tones[level] : "text-muted-foreground/60", className)} />;
}
