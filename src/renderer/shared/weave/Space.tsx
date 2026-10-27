import type { CSSProperties, ReactNode } from "react";
import { cn } from "@asterism/ui/utils";

/** Screen declaration: one stop in Space. With surface=false, there is no surface and content sits directly on the window material. */
export interface ScreenSpec { id: string; label: string; surface?: boolean; content: ReactNode }

/**
 * Managed space: the only layer within the window content area responsible for its relationship to the window (padding is determined by --space-inset).
 * Screens are tiled left to right (shallower on the left, deeper on the right) and switch by whole-screen translation; offscreen screens remain mounted but inert.
 * Screens and islands are positioned only relative to Space and are unaware of the titlebar.
 */
export function Space({ screens, active, className }: { screens: ScreenSpec[]; active: string; className?: string }) {
  const index = Math.max(0, screens.findIndex(screen => screen.id === active));
  return <div className={cn("space", className)}>
    {/* CSS calculates screen width and gaps; translation uses transform transitions without relying on measurement. */}
    <div className="space-strip" style={{ "--screen-index": index } as CSSProperties}>
      {screens.map(screen => <section key={screen.id} id={`screen-${screen.id}`} tabIndex={-1} aria-label={screen.label}
        inert={screen.id !== active} aria-hidden={screen.id !== active || undefined}
        data-surface={screen.surface !== false || undefined} className="space-screen">
        {screen.content}
      </section>)}
    </div>
  </div>;
}
