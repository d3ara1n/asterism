import type { ComponentProps } from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * Icon-only button: combines the official Button + Tooltip. The accessible name comes from label, and the tooltip matches it by default.
 * Use asChild with a menu or popover trigger as the child to share its button element, styling, and tooltip.
 */
export function IconButton({ label, tooltip = label, variant = "ghost", size = "icon-sm", ...props }: ComponentProps<typeof Button> & { label: string; tooltip?: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button variant={variant} size={size} aria-label={label} {...props} />
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>;
}
