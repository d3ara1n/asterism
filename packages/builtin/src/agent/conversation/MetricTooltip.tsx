import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@atelier/ui/ui/tooltip";

/** 只读计量：悬停或键盘聚焦查看详情，不提供点击操作。 */
export function MetricTooltip({ label, icon, value, children }: {
  label: string; icon: ReactNode; value: string; children: ReactNode;
}) {
  return <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>
      <span tabIndex={0} role="img" className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1.5 type-caption tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3.5"
        aria-label={`${label} · ${value}`}>
        {icon}<span>{value}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" align="start" sideOffset={6} collisionPadding={8}
      className="nodrag nopan w-80 max-w-[calc(100vw-1rem)] max-h-(--radix-tooltip-content-available-height) space-y-3 overflow-y-auto text-left [&_.type-caption]:text-inherit [&_.type-label]:text-inherit">
      {children}
    </TooltipContent>
  </Tooltip>;
}
