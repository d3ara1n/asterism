import type { ComponentProps } from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * 仅图标按钮：官方 Button + Tooltip 组合。可访问名称取 label，提示默认与之一致。
 * 根节点是 Tooltip，不能作为菜单或弹层触发器的 asChild 子元素；触发器场景直接使用 Button 并提供 aria-label。
 */
export function IconButton({ label, tooltip = label, variant = "ghost", size = "icon-sm", ...props }: ComponentProps<typeof Button> & { label: string; tooltip?: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button variant={variant} size={size} aria-label={label} {...props} />
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>;
}
