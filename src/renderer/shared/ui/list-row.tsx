import type { ReactNode } from "react";
import { cn } from "../utils";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "./item";

/**
 * 可打开详情的列表行：官方 Item 组合，标题按钮的命中区铺满整行，行内操作位于其上层。
 * 整行可点的列表统一使用此组合，业务代码不另写可点击的行。
 */
export function ListRow({ title, description, media, mediaVariant, actions, selected = false, disabled, inactive, onOpen, className, contentClassName }: {
  title: ReactNode; description?: ReactNode; media?: ReactNode; mediaVariant?: "default" | "icon"; actions?: ReactNode;
  selected?: boolean; disabled?: boolean; inactive?: boolean; onOpen: (origin: HTMLElement) => void;
  className?: string; contentClassName?: string;
}) {
  return <Item size="sm" className={cn("relative transition-colors hover:bg-accent/60 has-[[data-slot=list-row-open]:focus-visible]:bg-accent/60",
    selected && "bg-accent hover:bg-accent", inactive && "opacity-70", className)}>
    {media && <ItemMedia variant={mediaVariant}>{media}</ItemMedia>}
    <ItemContent className={cn("min-w-0", contentClassName)}>
      <button type="button" data-slot="list-row-open" disabled={disabled} aria-current={selected || undefined}
        className="text-left outline-none after:absolute after:inset-0 focus-visible:underline"
        onClick={event => onOpen(event.currentTarget)}><ItemTitle>{title}</ItemTitle></button>
      {description && <ItemDescription className="truncate">{description}</ItemDescription>}
    </ItemContent>
    {actions && <ItemActions className="relative">{actions}</ItemActions>}
  </Item>;
}
