import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import type { CardHeaderProps } from "@asterism-app/sdk/renderer";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { ArrowLeft } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fitHeader, type HeaderFit } from "./header-fit";

/** Facts the host renders itself; summary and actions stay in their contributor's tree through portals. */
type HeaderData = Pick<CardHeaderProps, "status"> & { summary: boolean; page?: Omit<NonNullable<CardHeaderProps["page"]>, "onBack"> };
type Contribution = { id: number; slot: HeaderSlot; order: number; data: HeaderData; back: { current: () => void } };
type HeaderSlot = "header" | "body";

/**
 * Title bar contributions for one object surface. The most recently mounted body contribution wins; otherwise the latest
 * header-slot contribution; otherwise the host's defaults.
 */
class HeaderStore {
  private readonly contributions = new Map<number, Contribution>();
  private readonly listeners = new Set<() => void>();
  private order = 0;
  active: Contribution | null = null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set(id: number, slot: HeaderSlot, data: HeaderData, back: { current: () => void }) {
    const previous = this.contributions.get(id);
    this.contributions.set(id, { id, slot, data, back, order: previous?.order ?? ++this.order });
    this.update();
  }
  remove(id: number) {
    if (this.contributions.delete(id)) this.update();
  }
  private update() {
    let active: Contribution | null = null;
    for (const item of this.contributions.values()) {
      if (!active || (item.slot === active.slot ? item.order > active.order : item.slot === "body")) active = item;
    }
    // A fresh object per update lets subscribers see changed data of the same contributor.
    this.active = active && { ...active };
    for (const listener of this.listeners) listener();
  }
}

type Targets = { summary: HTMLElement | null; actions: HTMLElement | null };
const SurfaceContext = createContext<{ store: HeaderStore; targets: Targets } | null>(null);
const SlotContext = createContext<HeaderSlot | null>(null);
/** Marks whether a subtree is the card's header contribution or its body. */
export const CardHeaderSlot = SlotContext.Provider;

let nextContributor = 0;
const noSubscription = () => () => {};

/** Host implementation behind the SDK's `CardHeader`. */
export function CardHeaderContribution({ summary, status, page, actions }: CardHeaderProps) {
  const surface = useContext(SurfaceContext), slot = useContext(SlotContext);
  const [id] = useState(() => ++nextContributor);
  const back = useRef(page?.onBack ?? (() => {}));
  back.current = page?.onBack ?? (() => {});
  const store = slot ? surface?.store : undefined;
  const hasSummary = summary !== undefined && summary !== null && summary !== false && summary !== "";
  useLayoutEffect(() => {
    if (!store || !slot) return;
    store.set(id, slot, {
      summary: hasSummary, status: status && { tone: status.tone, label: status.label, still: status.still },
      page: page && { title: page.title, backLabel: page.backLabel, autoFocus: page.autoFocus },
    }, back);
  }, [store, slot, id, hasSummary, status?.tone, status?.label, status?.still, !!page, page?.title, page?.backLabel, page?.autoFocus]);
  useLayoutEffect(() => () => store?.remove(id), [store, id]);
  const active = useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.active?.id === id);
  if (!active || !surface) return null;
  return <>
    {hasSummary && surface.targets.summary && createPortal(summary, surface.targets.summary)}
    {actions && surface.targets.actions && createPortal(actions, surface.targets.actions)}
  </>;
}

export function useHeaderSurface() {
  const [store] = useState(() => new HeaderStore());
  const [summary, setSummary] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  return { store, targets: { summary, actions }, setSummary, setActions };
}
export function HeaderSurfaceProvider({ surface, children }: { surface: ReturnType<typeof useHeaderSurface>; children: ReactNode }) {
  const { store, targets: { summary, actions } } = surface;
  return <SurfaceContext.Provider value={{ store, targets: { summary, actions } }}>{children}</SurfaceContext.Provider>;
}

/** A part that does not fit leaves the flow but stays measurable at its natural width. */
const yielded = "pointer-events-none invisible absolute";

/**
 * The leading control and the title row, in a fixed order: page prefix, title, status, summary. The kind is named by the icon alone. Parts yield to the title in the
 * order defined by `fitHeader`; every part stays mounted at its natural width so the row can be measured as it renders.
 */
export function HeaderTitle({ surface, icon, kind, title }: { surface: ReturnType<typeof useHeaderSurface>; icon: ReactNode; kind: string; title: string }) {
  const active = useSyncExternalStore(surface.store.subscribe, () => surface.store.active);
  const data = active?.data;
  const page = data?.page, status = data?.status;
  const heading = page?.title ?? title, prefix = page ? title : null;
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<HeaderFit>({ prefix: true, summary: true, statusLabel: true });
  const measure = useRef(() => {});
  measure.current = () => {
    const container = row.current;
    if (!container) return;
    const part = (name: string) => container.querySelector<HTMLElement>(`:scope > [data-part=${name}], :scope > * > [data-part=${name}]`);
    const width = (name: string) => part(name)?.offsetWidth ?? 0;
    const next = fitHeader(container.clientWidth, {
      title: part("title")?.scrollWidth ?? 0, prefix: width("prefix"), summary: data?.summary ? width("summary") : 0,
      statusIcon: width("status-icon"), statusLabel: width("status-label"),
    }, parseFloat(getComputedStyle(container).columnGap) || 0, 4);
    setFit(current => current.prefix === next.prefix && current.summary === next.summary && current.statusLabel === next.statusLabel ? current : next);
  };
  // Text changes arrive with a render; portal content and container width changes arrive through the observer.
  useLayoutEffect(() => { measure.current(); });
  useLayoutEffect(() => {
    const container = row.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure.current());
    observer.observe(container);
    for (const element of container.querySelectorAll("[data-part]")) observer.observe(element);
    return () => observer.disconnect();
  }, [!!status, !!data?.summary]);

  return <>
    {page
      ? <IconButton size="icon-xs" className="nodrag -ml-1 shrink-0" label={page.backLabel} autoFocus={page.autoFocus}
        onClick={() => active?.back.current()}><ArrowLeft /></IconButton>
      : <TooltipHint content={kind}><span role="img" aria-label={kind} className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span></TooltipHint>}
    <div ref={row} className="relative flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
      {prefix && <span data-part="prefix" aria-hidden={!fit.prefix || undefined}
        className={cn("type-label shrink-0 whitespace-nowrap", !fit.prefix && yielded)}>{prefix}<span aria-hidden="true"> ›</span></span>}
      <TooltipHint content={heading}><h2 data-part="title" className="type-section min-w-0 truncate">
        {prefix && !fit.prefix && <span className="sr-only">{prefix} › </span>}{heading}
      </h2></TooltipHint>
      {status && <span role="status" className="type-caption flex shrink-0 items-center gap-1 self-center whitespace-nowrap">
        <TooltipHint content={fit.statusLabel ? undefined : status.label}>
          <span data-part="status-icon" className="inline-flex"><StatusIcon tone={status.tone} still={status.still} className="size-3.5" /></span>
        </TooltipHint>
        <span data-part="status-label" aria-hidden={!fit.statusLabel || undefined}
          className={cn(status.tone === "error" && "text-destructive", !fit.statusLabel && yielded)}>{status.label}</span>
        {!fit.statusLabel && <span className="sr-only">{status.label}</span>}
      </span>}
      <span ref={surface.setSummary} data-part="summary" aria-hidden={!fit.summary || undefined}
        className={cn("type-caption shrink-0 whitespace-nowrap empty:hidden", (!fit.summary || !data?.summary) && yielded)} />
    </div>
  </>;
}
