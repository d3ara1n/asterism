import type { ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@asterism-app/ui/ui/hover-card";

/** Read-only measurements: hover or keyboard focus opens a details card; no click action is provided. */
export function MetricCard({ label, icon, value, children }: {
  label: string; icon: ReactNode; value: string; children: ReactNode;
}) {
  return <HoverCard openDelay={300} closeDelay={100}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} role="img" className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1.5 type-caption tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3.5"
        aria-label={`${label} · ${value}`}>
        {icon}<span>{value}</span>
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" sideOffset={6} collisionPadding={8}
      className="nodrag nopan w-80 max-w-[calc(100vw-1rem)] max-h-(--radix-hover-card-content-available-height) space-y-3 overflow-y-auto">
      {children}
    </HoverCardContent>
  </HoverCard>;
}
