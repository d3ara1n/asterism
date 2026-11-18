import { useId, useRef, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../utils";
import { TooltipHint } from "../tooltip-hint";
import { Button } from "./button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "./item";

/** Elements that keep their own click behavior inside a row; action slots are excluded as a whole, including the gaps between their controls. */
const ownClickSelector = [
  "[data-slot=item-actions]", "button", "a[href]", "input", "select", "textarea", "label", "summary",
  "[contenteditable]:not([contenteditable=false])", "[role=button]", "[role=link]", "[role=checkbox]", "[role=switch]",
].join(",");

/** Hover and keyboard focus of the primary control share one tone; selection replaces both. */
const highlightTones = {
  default: "hover:bg-accent/60 has-[[data-slot=list-row-open]:focus-visible]:bg-accent/60",
  navigation: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 has-[[data-slot=list-row-open]:focus-visible]:bg-accent has-[[data-slot=list-row-open]:focus-visible]:text-accent-foreground dark:has-[[data-slot=list-row-open]:focus-visible]:bg-accent/50",
} as const;

/**
 * An openable row composed from Item primitives. The row is the interactive surface: it owns the hover,
 * focus, selection, and disabled tones, and a click on an inert area such as padding, media, or description
 * activates the primary button. The primary button carries the accessible name, keyboard focus, and the open
 * action; action slots are sibling controls with their own behavior.
 */
export function ListRow({ title, description, descriptionLines = 1, details, media, mediaVariant, leadingActions, actions, opens = false, selected = false, disabled, inactive, onOpen, className, contentClassName, variant = "default", buttonProps, tooltip }: {
  title: ReactNode; tooltip?: string; description?: ReactNode; media?: ReactNode; mediaVariant?: "default" | "icon"; leadingActions?: ReactNode; actions?: ReactNode;
  /** Two lines suit prose descriptions such as skill summaries; one line suits identifiers and status. */ descriptionLines?: 1 | 2;
  /** Opening shows the item in another island; a trailing chevron marks the row as a navigation target. */ opens?: boolean;
  /** Additional information below the description. */ details?: ReactNode;
  selected?: boolean; disabled?: boolean; inactive?: boolean; onOpen: (origin: HTMLElement) => void;
  className?: string; contentClassName?: string;
  variant?: "default" | "navigation";
  buttonProps?: Omit<ComponentProps<"button">, "children" | "onClick" | "disabled">;
}) {
  const navigation = variant === "navigation";
  const primary = useRef<HTMLButtonElement>(null);
  const descriptionId = useId(), detailsId = useId();
  const describedBy = [description && descriptionId, details && detailsId].filter(Boolean).join(" ") || undefined;
  const activate = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    // React also bubbles clicks from portaled menus and tooltips; only clicks inside the row's DOM count.
    if (event.defaultPrevented || !(target instanceof Element) || !event.currentTarget.contains(target)) return;
    const control = target.closest(ownClickSelector);
    if (control && event.currentTarget.contains(control)) return;
    // Dragging across row text selects it instead of opening the row; selections elsewhere do not block opening.
    const selection = target.ownerDocument.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(event.currentTarget, true)) return;
    // Focus first, as a direct button click would, so keyboard navigation continues from this row.
    // A disabled button ignores focus() and click(), so disabled rows stay inert.
    primary.current?.focus({ preventScroll: true });
    primary.current?.click();
  };
  return <Item size="sm" onClick={activate} className={cn("group/list-row transition-colors",
    navigation && "h-9 w-full min-w-0 flex-nowrap gap-0 border-0 px-3 py-2 text-sm font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    selected ? "bg-selected text-selected-foreground" : !disabled && highlightTones[variant],
    inactive && "opacity-70", className)}>
    {leadingActions && <ItemActions className="shrink-0">{leadingActions}</ItemActions>}
    {media && <ItemMedia variant={mediaVariant} className={cn(navigation && "mr-2 [&_svg]:size-4", disabled && "opacity-50")}>{media}</ItemMedia>}
    <ItemContent className={cn("min-w-0", disabled && "opacity-50", contentClassName)}>
      <TooltipHint content={tooltip}><button ref={primary} type="button" data-slot="list-row-open" disabled={disabled} aria-current={selected || undefined}
        aria-describedby={describedBy} {...buttonProps}
        className={cn("min-w-0 text-left outline-none focus-visible:underline", buttonProps?.className)}
        onClick={event => onOpen(event.currentTarget)}>{navigation ? <span className="block min-w-0">{title}</span> : <ItemTitle>{title}</ItemTitle>}</button></TooltipHint>
      {description && <ItemDescription id={descriptionId} className={descriptionLines === 1 ? "truncate" : "line-clamp-2 text-pretty"}>{description}</ItemDescription>}
      {details && <ItemDescription id={detailsId} className="type-caption truncate">{details}</ItemDescription>}
    </ItemContent>
    {actions && <ItemActions className={cn("shrink-0", navigation && "gap-0")}>{actions}</ItemActions>}
    {opens && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/list-row:text-foreground" aria-hidden="true" />}
  </Item>;
}

/** Reveal row actions on hover or focus while retaining keyboard focusability. */
export function ListRowAction({ className, ...props }: Omit<ComponentProps<typeof Button>, "variant" | "size">) {
  return <Button type="button" variant="ghost" size="icon-xs" {...props}
    className={cn("w-0 overflow-hidden p-0 opacity-0 group-hover/list-row:w-6 group-hover/list-row:opacity-100 group-focus-within/list-row:w-6 group-focus-within/list-row:opacity-100 data-[state=open]:w-6 data-[state=open]:opacity-100", className)} />;
}
