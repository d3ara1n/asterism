import type { ComponentProps } from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * Icon-only button: combines the official Button + Tooltip. The accessible name comes from label, and the tooltip matches it by default.
 * The root is Tooltip and cannot serve as the asChild child of a menu or popover trigger; use Button directly with aria-label for triggers.
 */
export function IconButton({ label, tooltip = label, variant = "ghost", size = "icon-sm", ...props }: ComponentProps<typeof Button> & { label: string; tooltip?: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button variant={variant} size={size} aria-label={label} {...props} />
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>;
}
