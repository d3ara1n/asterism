import { motion, AnimatePresence } from "motion/react";

import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { windowGeometry } from "../../../shared/desktop";
import type { IslandView } from "../../../shared/workbench";
import { cn } from "@asterism-app/ui/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";

import { fadeTransition, islandTransition } from "./motion";
import { closure, focusAfterClose, follow, layout, moveIsland, openIsland, removeIslands, type IslandWidth } from "./model";

/** Island declaration: width, accessible name, and content. origin is the element that opened it, used for expansion animation and focus restoration. */
export interface IslandSpec {
  /** Identity within the screen: opening an existing ordinary identity locates that island instead of creating another. */
  id: string;
  width: IslandWidth;
  label: UiText;
  render: () => ReactNode;
  /** When false, the island has no surface, and content sits directly on the window material. */
  surface?: boolean;
  origin?: HTMLElement | null;
  /** Fixed islands only: they own their visibility, and closing through their own controls or Esc calls this after the islands they opened close. */
  onClose?: () => void;
  /** Ordinary islands only: serializable content from which the owner can rebuild this island; absent for islands that exist only while open. */
  restore?: IslandView;
}

/** Ordinary island state: owner is the island that opened it; size is a fixed width chosen through the island menu, or null for the declared width. */
export interface StripIsland { id: string; owner: string | null; size: number | null; spec: IslandSpec }
/**
 * focus null means the root. scope names the context the islands belong to, such as a session;
 * an owner persists the arrangement only while the scope is its own, so clearing islands for navigation is not recorded.
 */
export interface StripState { islands: readonly StripIsland[]; focus: string | null; scope: string | null }

/** Ordinary island strip of one screen: an external store so cards and persistence can observe open identities without rerendering the screen's owner. */
export class IslandStrip {
  private state: StripState = { islands: [], focus: null, scope: null };
  private screen: ((id: string, force: boolean) => Promise<boolean>) | null = null;
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.state;
  has(id: string): boolean { return this.state.islands.some(island => island.id === id); }
  set(next: Partial<StripState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  /** Close an island and the islands it opened through the mounted screen; false when no screen shows this strip. */
  close(id: string, options?: { force?: boolean }): Promise<boolean> {
    return this.screen ? this.screen(id, options?.force ?? false) : Promise.resolve(false);
  }
  /** Called by the screen showing this strip. */
  attach(close: (id: string, force: boolean) => Promise<boolean>): () => void {
    this.screen = close;
    return () => { if (this.screen === close) this.screen = null; };
  }
}

/** Close guard: returning false (or resolving to false) cancels closing; can asynchronously await user confirmation. */
export type CloseGuard = () => boolean | Promise<boolean>;

/** Window controls of an ordinary island, presented by the island chrome. */
export interface IslandArrangement {
  size: number | null;
  /** Medium preset width that size presets scale. */
  medium: number;
  first: boolean;
  last: boolean;
  move(direction: -1 | 1): void;
  resize(size: number | null): void;
}

export interface IslandApi {
  id: string;
  /** Whether an ordinary island with this identity is open in the screen. */
  has: (id: string) => boolean;
  /** Open an ordinary island owned by this island at the right end, or locate an existing one with the same identity. Resolves to whether it is shown. */
  open: (spec: IslandSpec) => Promise<boolean>;
  /** Close this island and the islands it opened, transitively (no effect on the root). force skips guards for invalid content. Resolves to whether it closed. */
  close: (options?: { force?: boolean }) => Promise<boolean>;
  /** Close the islands this island opened, transitively; with target, only that directly owned island and the islands it opened. */
  closeOwned: (options?: { force?: boolean; target?: string }) => Promise<boolean>;
  /** Register a close guard for this island and return an unregister function. Usually used through useCloseGuard. */
  guard: (guard: CloseGuard) => () => void;
  /** Present on ordinary islands only. */
  arrangement?: IslandArrangement;
}
const IslandContext = createContext<IslandApi | null>(null);
const StripContext = createContext<IslandStrip | null>(null);
export interface ScreenHandle {
  /** Close every ordinary island; any refusal cancels. */
  closeAll(): Promise<boolean>;
  /** Close an island of this screen as if through its own controls. */
  close(id: string): Promise<boolean>;
}
/** Use within island content. */
export function useIsland(): IslandApi {
  const api = useContext(IslandContext);
  if (!api) throw new Error("useIsland must be used inside a Screen island.");
  return api;
}
/** The ordinary island strip of the containing screen, for owners that restore and persist its arrangement. */
export function useIslandStrip(): IslandStrip {
  const strip = useContext(StripContext);
  if (!strip) throw new Error("useIslandStrip must be used inside a Screen.");
  return strip;
}
/** Subscribe to whether an ordinary island is open in the containing screen; usable in memoized content that does not rerender with the screen. */
export function useIslandOpen(id: string): boolean {
  const strip = useContext(StripContext);
  if (!strip) throw new Error("useIslandOpen must be used inside a Screen.");
  return useSyncExternalStore(strip.subscribe, () => strip.has(id));
}

/**
 * Register a close guard for the containing island: consulted when closing this island or an island that owns it.
 * A null guard allows closing; guards always use the latest callback, with no need to reregister on state changes.
 */
export function useCloseGuard(guard: CloseGuard | null) {
  const island = useIsland();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => island.guard(() => latest.current ? latest.current() : true), [island]);
}

/** Effective width: a chosen size holds regardless of the window and may overflow into strip scrolling. */
function islandWidth(island: StripIsland): IslandWidth {
  return island.size === null ? island.spec.width : { min: island.size, max: island.size };
}
function mediumWidth(width: IslandWidth): number {
  return width.max ?? Math.round(width.min * 1.5);
}

/**
 * One screen: fixed leading islands, the root, ordinary islands, and fixed trailing islands, left to right.
 * Fixed islands participate in layout and focus only; ordinary islands open at the right end, swap through the island menu, and close with the islands they opened.
 * When all min widths fit, distribute by grow and center without translation; otherwise fall back to min and let the viewport follow focus.
 */
export function Screen({ label, root, leading, trailing, strip: external, className, ref }: {
  label: string; root: IslandSpec; leading?: IslandSpec[]; trailing?: IslandSpec[]; className?: string;
  /** Owner-provided strip for persistence and outside observation; otherwise the screen keeps its own. */
  strip?: IslandStrip;
  ref?: Ref<ScreenHandle>;
}) {
  const i18n = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const stripElement = useRef<HTMLDivElement>(null);
  const [internal] = useState(() => new IslandStrip());
  const strip = external ?? internal;
  const state = useSyncExternalStore(strip.subscribe, strip.getSnapshot);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const fixed = useMemo(() => [...(leading ?? []), ...(trailing ?? [])], [leading, trailing]);
  const islands = useMemo(() => [...(leading ?? []).map(spec => ({ spec, width: spec.width })), { spec: root, width: root.width },
    ...state.islands.map(island => ({ spec: island.spec, width: islandWidth(island), island })),
    ...(trailing ?? []).map(spec => ({ spec, width: spec.width }))] as { spec: IslandSpec; width: IslandWidth; island?: StripIsland }[],
  [leading, root, trailing, state.islands]);
  const focus = state.focus !== null && islands.some(item => item.spec.id === state.focus) ? state.focus : root.id;
  const gap = windowGeometry.gap;

  useLayoutEffect(() => {
    // Layout width uses the strip width after subtracting --space-inset; the viewport itself fills the container.
    const element = stripElement.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { spans, total, overflow } = useMemo(() => layout(islands.map(item => ({ id: item.spec.id, width: item.width })), width, gap), [islands, width, gap]);
  const focusIndex = Math.max(0, islands.findIndex(item => item.spec.id === focus));
  // Follow focus only during overflow: stay still when visible and align to the edge when out of bounds; do not translate when everything fits.
  useLayoutEffect(() => { setOffset(current => overflow ? follow(spans, focusIndex, width, current) : 0); }, [spans, focusIndex, width, overflow]);

  // Guards may asynchronously await confirmation while state changes: always decide using the latest state rather than the closure captured at initiation.
  const latest = useRef({ root, fixed, order: islands.map(item => item.spec.id) });
  latest.current = { root, fixed, order: islands.map(item => item.spec.id) };
  const guards = useRef(new Map<string, Set<CloseGuard>>());
  const pending = useRef(false);
  /** Consult guards in order (deepest first); any refusal cancels the operation. Ignore other close requests while consulting. */
  const release = async (ids: readonly string[], force?: boolean): Promise<boolean> => {
    if (force || ids.length === 0) return true;
    if (pending.current) return false;
    pending.current = true;
    try {
      for (const id of ids) for (const guard of guards.current.get(id) ?? []) if (!(await guard())) return false;
      return true;
    } finally { pending.current = false; }
  };
  const focusElement = (id: string) => requestAnimationFrame(() =>
    viewport.current?.querySelector<HTMLElement>(`[data-island="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
  const known = (id: string) => latest.current.order.includes(id);
  /** Remove ordinary islands and settle focus on the composed order before removal. */
  const remove = (removed: readonly string[]) => {
    const current = strip.getSnapshot();
    const focused = current.focus !== null && known(current.focus) ? current.focus : latest.current.root.id;
    strip.set({ islands: removeIslands(current.islands, removed),
      focus: focusAfterClose(latest.current.order, removed, focused, latest.current.root.id) });
  };
  const open = async (owner: string, spec: IslandSpec) => {
    if (!known(owner)) return false;
    const current = strip.getSnapshot();
    const next = openIsland(current.islands, { id: spec.id, owner, size: null, spec });
    strip.set({ islands: next.islands, focus: spec.id });
    // A located island receives focus here; a new one focuses itself after mounting.
    if (!next.opened) focusElement(spec.id);
    return true;
  };
  // AnimatePresence completes the exit animation before unmounting.
  const close = async (id: string, force?: boolean) => {
    if (id === latest.current.root.id) return false;
    const fixedSpec = latest.current.fixed.find(spec => spec.id === id);
    const ordinary = strip.getSnapshot().islands.find(island => island.id === id);
    if (!fixedSpec && !ordinary) return false;
    if (!(await release([...closure(strip.getSnapshot().islands, id), ...(fixedSpec ? [id] : [])], force))) return false;
    const removed = closure(strip.getSnapshot().islands, id);
    if (!fixedSpec && !removed.includes(id)) return true;
    remove(fixedSpec ? [...removed, id] : removed);
    fixedSpec?.onClose?.();
    const origin = (fixedSpec ?? ordinary!.spec).origin;
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus({ preventScroll: true }));
    return true;
  };
  const closeOwned = async (id: string, force?: boolean, target?: string) => {
    const owned = () => {
      const islands = strip.getSnapshot().islands;
      if (target === undefined) return closure(islands, id).filter(item => item !== id);
      return islands.some(island => island.id === target && island.owner === id) ? closure(islands, target) : [];
    };
    if (!(await release(owned(), force))) return false;
    remove(owned());
    return true;
  };
  const closeAll = async () => {
    const all = () => strip.getSnapshot().islands.map(island => island.id).reverse();
    if (!(await release(all()))) return false;
    remove(all());
    return true;
  };
  const guard = (id: string, fn: CloseGuard) => {
    const set = guards.current.get(id) ?? new Set();
    set.add(fn); guards.current.set(id, set);
    return () => { set.delete(fn); if (!set.size) guards.current.delete(id); };
  };
  const setFocus = (id: string) => { if (strip.getSnapshot().focus !== id) strip.set({ focus: id }); };
  const has = (id: string) => strip.has(id);
  // An identity absent from the screen has nothing to close.
  useImperativeHandle(ref, () => ({ closeAll, close: id => known(id) ? close(id) : Promise.resolve(true) }));
  const latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => strip.attach((id, force) => latestClose.current(id, force)), [strip]);

  const shift = overflow ? -offset : (width - total) / 2;
  const onWheel = (event: React.WheelEvent) => {
    if (!overflow || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if ((event.target as Element).closest(".island-body")) return; // Do not take over inside islands (including the canvas)
    setOffset(current => Math.min(Math.max(current + event.deltaX, 0), total - width));
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Esc closes the focused ordinary island, or a fixed island that declares closing; otherwise defer to the outer layer.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!strip.has(focus) && !fixed.some(spec => spec.id === focus && spec.onClose)) return;
    event.preventDefault(); event.stopPropagation();
    void close(focus);
  };
  /** Segmented navigation: focus the target island so the viewport follows it; move DOM focus only after the target is no longer inert. */
  const moveTo = (id: string) => { setFocus(id); focusElement(id); };
  const ordinaries = state.islands;

  return <StripContext.Provider value={strip}><div className={cn("weave-viewport", className)} aria-label={label} role="group" ref={viewport} onWheel={onWheel} onKeyDown={onKeyDown}>
    {/* Do not lay out islands until viewport width is measured, avoiding a frame of overflow layout at zero width. */}
    <div className="weave-strip" ref={stripElement} style={{ visibility: width ? undefined : "hidden" }}>
      {/* Each island is absolutely positioned and interpolates to its own target x and width: adding, removing, or swapping islands makes others smoothly move from their current positions. */}
      <AnimatePresence initial={false}>{islands.map(({ spec, island }, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - (overflow ? offset : 0), visibleRight = visibleLeft + span.width;
        const hidden = overflow && (visibleRight <= 0 || visibleLeft >= width);
        const peek = overflow && !hidden && (visibleLeft < -1 || visibleRight > width + 1);
        const position = island ? ordinaries.indexOf(island) : -1;
        return <Island key={spec.id} spec={spec} width={span.width} x={span.left + shift} hidden={hidden} peek={peek}
          focused={islands.length > 1 && spec.id === focus}
          api={{
            id: spec.id, has,
            open: next => open(spec.id, next),
            close: options => close(spec.id, options?.force),
            closeOwned: options => closeOwned(spec.id, options?.force, options?.target),
            guard: fn => guard(spec.id, fn),
            arrangement: island && {
              size: island.size, medium: mediumWidth(island.spec.width),
              first: position === 0, last: position === ordinaries.length - 1,
              move: direction => { strip.set({ islands: moveIsland(strip.getSnapshot().islands, spec.id, direction), focus: spec.id }); focusElement(spec.id); },
              resize: size => strip.set({ islands: strip.getSnapshot().islands.map(item => item.id === spec.id ? { ...item, size } : item) }),
            },
          }}
          onFocus={() => setFocus(spec.id)} />;
      })}</AnimatePresence>
    </div>
    {/* Segmented navigation during overflow: each segment corresponds to an island; clicking focuses it and the viewport follows, allowing even completely displaced islands to return into view. */}
    {overflow && <div className="weave-indicator">
      {islands.map(({ spec }, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - offset, visibleRight = visibleLeft + span.width;
        const visible = visibleRight > 0 && visibleLeft < width;
        const name = i18n.text(spec.label);
        return <Tooltip key={spec.id}><TooltipTrigger asChild>
          <button type="button" className="weave-segment" aria-label={name} aria-current={spec.id === focus || undefined}
            data-visible={visible || undefined}
            style={{ left: `${(span.left / total) * 100}%`, width: `${(span.width / total) * 100}%` }}
            onClick={() => moveTo(spec.id)} />
        </TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>;
      })}
    </div>}
  </div></StripContext.Provider>;
}

function useStableIsland(api: IslandApi): IslandApi {
  const latest = useRef(api);
  latest.current = api;
  return useMemo(() => ({
    get id() { return latest.current.id; }, get arrangement() { return latest.current.arrangement; },
    has: id => latest.current.has(id),
    open: spec => latest.current.open(spec), close: options => latest.current.close(options),
    closeOwned: options => latest.current.closeOwned(options), guard: fn => latest.current.guard(fn),
  }), []);
}

function Island({ ref, spec, width, x, hidden, peek, focused, api, onFocus }: {
  ref?: React.Ref<HTMLElement>; spec: IslandSpec; width: number; x: number; hidden: boolean; peek: boolean; focused: boolean; api: IslandApi; onFocus: () => void;
}) {
  const i18n = useI18n();
  const element = useRef<HTMLElement>(null);
  // Islands opened by content receive focus after mounting.
  useEffect(() => { if (spec.origin) element.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stable = useStableIsland(api);
  const latestFocus = useRef(onFocus);
  latestFocus.current = onFocus;
  const focusSelf = useCallback(() => latestFocus.current(), []);
  // For islands partially outside the viewport, clicking the exposed portion brings them into view.
  // Expand in place: fade in from a slight offset left of the target position; Motion transitions position and width from their current values.
  return <motion.section ref={node => { element.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
    initial={{ opacity: 0, x: x - 16, scale: 0.98, width }} animate={{ opacity: 1, x, scale: 1, width }} exit={{ opacity: 0, scale: 0.98, transition: fadeTransition }}
    transition={islandTransition} data-island={spec.id} tabIndex={-1} aria-label={i18n.text(spec.label)}
    inert={hidden} aria-hidden={hidden || undefined} data-peek={peek || undefined} data-focused={focused || undefined}
    data-surface={spec.surface !== false || undefined}
    className="island"
    onFocusCapture={focusSelf} onPointerDownCapture={focusSelf}>
    {spec.surface !== false && <div className="island-backdrop" aria-hidden="true" />}
    <div className="island-body"><IslandContext.Provider value={stable}>{spec.render()}</IslandContext.Provider></div>
  </motion.section>;
}
