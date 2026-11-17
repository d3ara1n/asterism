import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** A plain-text hint on the existing element; rich previews compose their own tooltip or hover card. */
export function TooltipHint({ content, children }: { content?: ReactNode; children: ReactElement }) {
  if (content == null || content === false || content === "") return children;
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent className="max-w-[min(24rem,var(--radix-tooltip-content-available-width))] whitespace-pre-wrap break-words text-left">
      {/* The arrow stays outside the scroll owner; available height includes the shell's py-1.5 padding. */}
      <div className="max-h-[calc(var(--radix-tooltip-content-available-height)-var(--spacing)*3)] overflow-y-auto">{content}</div>
    </TooltipContent>
  </Tooltip>;
}
