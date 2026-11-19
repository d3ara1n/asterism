import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../utils";
import { TooltipHint } from "../tooltip-hint";
import { Button } from "./button";
import { Item, ItemActions } from "./item";

/** Hover and keyboard focus of the primary control share one tone; selection replaces both. */
const highlightTones = {
  default: "hover:bg-accent/60 has-[[data-slot=list-row-open]:focus-visible]:bg-accent/60",
  navigation: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 has-[[data-slot=list-row-open]:focus-visible]:bg-accent has-[[data-slot=list-row-open]:focus-visible]:text-accent-foreground dark:has-[[data-slot=list-row-open]:focus-visible]:bg-accent/50",
} as const;

// Pointer focus can remain on a button after a click or menu dismissal. Only visible
// keyboard focus, hover, or an active action should keep hidden controls revealed.
const revealActions = "[--list-row-action-reveal:0] hover:[--list-row-action-reveal:1] has-[:focus-visible]:[--list-row-action-reveal:1] has-[[data-list-row-action]:is([aria-expanded=true],[aria-busy=true])]:[--list-row-action-reveal:1] [@media(hover:none)_and_(pointer:coarse)]:[--list-row-action-reveal:1]";

/** One visual row. Display content belongs inside the primary button; interactive slots are its siblings. */
export function ListRow({ title, description, descriptionLines = 1, details, media, mediaVariant, trailing, leadingActions, actions, opens = false, selected = false, disabled, inactive, onOpen, className, contentClassName, variant = "default", buttonProps, tooltip }: {
  /** Primary button content (including media, description, details, and trailing) must be non-interactive phrasing content. */
  title: ReactNode; tooltip?: string; description?: ReactNode; media?: ReactNode; mediaVariant?: "default" | "icon";
  /** Non-interactive end matter, such as a badge. Clicks on it open the row. */
  trailing?: ReactNode;
  leadingActions?: ReactNode; actions?: ReactNode;
  /** Two lines suit prose descriptions such as skill summaries; one line suits identifiers and status. */
  descriptionLines?: 1 | 2;
  /** Opening shows the item in another island; a chevron marks the primary control. */ opens?: boolean;
  /** Additional information below the description. */ details?: ReactNode;
  selected?: boolean; disabled?: boolean; inactive?: boolean; onOpen: (origin: HTMLElement) => void;
  className?: string; contentClassName?: string;
  variant?: "default" | "navigation";
  buttonProps?: Omit<ComponentProps<"button">, "children" | "onClick" | "disabled">;
}) {
  const navigation = variant === "navigation";
  const id = useId();
  const titleId = `${id}-title`, descriptionId = `${id}-description`, detailsId = `${id}-details`, trailingId = `${id}-trailing`;
  const describedBy = [description && descriptionId, details && detailsId, trailing && trailingId, buttonProps?.["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return <Item size="sm" className={cn("group/list-row gap-0 p-0 transition-colors [--list-row-x:--spacing(4)] [--list-row-y:--spacing(3)] [--list-row-gap:--spacing(2.5)]",
    navigation && "h-9 w-full min-w-0 flex-nowrap border-0 text-sm font-medium whitespace-nowrap [--list-row-x:--spacing(3)] [--list-row-y:--spacing(2)] [--list-row-gap:--spacing(2)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    selected ? "bg-selected text-selected-foreground" : !disabled && highlightTones[variant],
    actions && revealActions, inactive && "opacity-70", className)}>
    {leadingActions && <ItemActions className="shrink-0 ps-(--list-row-x)">{leadingActions}</ItemActions>}
    <TooltipHint content={tooltip}>
      <button type="button" data-slot="list-row-open" disabled={disabled} aria-current={selected || undefined}
        aria-labelledby={buttonProps?.["aria-label"] === undefined ? titleId : undefined} {...buttonProps} aria-describedby={describedBy}
        className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-(--list-row-gap) self-stretch rounded-[inherit] px-(--list-row-x) py-(--list-row-y) text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50", leadingActions && "ps-(--list-row-gap)", buttonProps?.className)}
        onClick={event => onOpen(event.currentTarget)}>
        {media && <span data-slot="item-media" className={cn("flex shrink-0 items-center justify-center [&_svg]:pointer-events-none",
          description && "mt-0.5 self-start", mediaVariant === "icon" && "size-8 rounded-sm border bg-muted [&_svg:not([class*='size-'])]:size-4")}>{media}</span>}
        <span data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col gap-1", contentClassName)}>
          <span id={titleId} data-slot="item-title" className={navigation ? "block min-w-0" : "flex w-fit max-w-full items-center gap-2 text-sm leading-snug font-medium"}>{title}</span>
          {description && <span id={descriptionId} data-slot="item-description" className={cn("text-sm leading-normal font-normal text-muted-foreground", descriptionLines === 1 ? "block truncate" : "line-clamp-2 text-pretty")}>{description}</span>}
          {details && <span id={detailsId} data-slot="item-description" className="type-caption block truncate">{details}</span>}
        </span>
        {trailing && <span id={trailingId} className="shrink-0">{trailing}</span>}
        {opens && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/list-row:text-foreground" aria-hidden="true" />}
      </button>
    </TooltipHint>
    {actions && <ItemActions className={cn(
      // Share the row's end inset with visible actions, but do not reserve an empty gutter for collapsed controls.
      "shrink-0 pe-[calc(var(--list-row-action-inset,var(--list-row-x))*var(--list-row-action-reveal))] transition-[padding-inline-end] empty:hidden has-[>:not([data-list-row-action])]:pe-[var(--list-row-action-inset,var(--list-row-x))]",
      navigation ? "gap-0" : "gap-(--list-row-gap)",
    )}>{actions}</ItemActions>}
  </Item>;
}

/** A revealable action stays in the tab order even when it takes no space. */
export function ListRowAction({ className, ...props }: Omit<ComponentProps<typeof Button>, "variant" | "size">) {
  return <Button type="button" variant="ghost" size="icon-xs" {...props} data-list-row-action=""
    className={cn("w-[calc(--spacing(6)*var(--list-row-action-reveal,0))] overflow-hidden p-0 opacity-[var(--list-row-action-reveal,0)]", className)} />;
}
