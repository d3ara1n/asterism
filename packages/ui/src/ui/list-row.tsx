import type { ComponentProps, ReactNode } from "react";
import { cn } from "../utils";
import { Button, buttonVariants } from "./button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "./item";

/**
 * Compose an openable row from Item primitives. The title's hit area spans the row;
 * action slots sit above it, keeping interactive controls separate from decorative media.
 */
export function ListRow({ title, description, details, media, mediaVariant, leadingActions, actions, selected = false, disabled, inactive, onOpen, className, contentClassName, variant = "default", buttonProps }: {
  title: ReactNode; description?: ReactNode; media?: ReactNode; mediaVariant?: "default" | "icon"; leadingActions?: ReactNode; actions?: ReactNode;
  /** Additional information below the description. */ details?: ReactNode;
  selected?: boolean; disabled?: boolean; inactive?: boolean; onOpen: (origin: HTMLElement) => void;
  className?: string; contentClassName?: string;
  variant?: "default" | "navigation";
  buttonProps?: Omit<ComponentProps<"button">, "children" | "onClick" | "disabled">;
}) {
  const navigation = variant === "navigation";
  return <Item size="sm" className={cn("group/list-row relative transition-colors hover:bg-accent/60 has-[[data-slot=list-row-open]:focus-visible]:bg-accent/60",
    selected && "bg-selected text-selected-foreground hover:bg-selected has-[[data-slot=list-row-open]:focus-visible]:bg-selected", inactive && "opacity-70",
    navigation && cn(buttonVariants({ variant: selected ? "selected" : "ghost" }), "flex w-full min-w-0 flex-nowrap gap-0 border-0 px-3"),
    className)}>
    {leadingActions && <ItemActions className="relative z-10 shrink-0">{leadingActions}</ItemActions>}
    {media && <ItemMedia variant={mediaVariant} className={cn(navigation && "mr-2 [&_svg]:size-4")}>{media}</ItemMedia>}
    <ItemContent className={cn("min-w-0", contentClassName)}>
      <button type="button" data-slot="list-row-open" disabled={disabled} aria-current={selected || undefined}
        {...buttonProps}
        className={cn("min-w-0 text-left outline-none after:absolute after:inset-0 focus-visible:underline", disabled && "opacity-50", buttonProps?.className)}
        onClick={event => onOpen(event.currentTarget)}>{navigation ? <span className="block min-w-0">{title}</span> : <ItemTitle>{title}</ItemTitle>}</button>
      {description && <ItemDescription className="truncate">{description}</ItemDescription>}
      {details && <ItemDescription className="type-caption truncate">{details}</ItemDescription>}
    </ItemContent>
    {actions && <ItemActions className={cn("relative shrink-0", navigation && "gap-0")}>{actions}</ItemActions>}
  </Item>;
}

/** Reveal row actions on hover or focus while retaining keyboard focusability. */
export function ListRowAction({ className, ...props }: Omit<ComponentProps<typeof Button>, "variant" | "size">) {
  return <Button type="button" variant="ghost" size="icon-xs" {...props}
    className={cn("w-0 overflow-hidden p-0 opacity-0 transition-none group-hover/list-row:w-6 group-hover/list-row:opacity-100 group-focus-within/list-row:w-6 group-focus-within/list-row:opacity-100 data-[state=open]:w-6 data-[state=open]:opacity-100", className)} />;
}
