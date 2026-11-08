import { motion, AnimatePresence, useReducedMotion } from "motion/react";

import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { windowGeometry } from "../../../shared/desktop";
import type { IslandView } from "../../../shared/workbench";
import { cn } from "@asterism-app/ui/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";

import { fadeTransition, islandTransition } from "./motion";
import { islandsMessages } from "../../messages/islands";
import { toast } from "../toast";
import { bindIsland, closure, focusAfterClose, follow, layout, moveIsland, openIsland, removeIslands, type IslandSlot, type IslandWidth, type Span } from "./model";

/** Settled layout changes place islands immediately; opacity and scale keep their usual timing. */
const settledTransition = { ...islandTransition, x: { duration: 0 }, width: { duration: 0 } };

/** Island declaration: width, accessible name, and content. origin is the element that opened it, used for expansion animation and focus restoration. */
export interface IslandSpec {
  /** Initial content lookup key within the screen; opening an existing key locates that island. */
  key: string;
  width: IslandWidth;
  label: UiText;
  render: () => ReactNode;
  /** False omits the shell; transparent retains its border, clipping, and focus highlight without a background fill. Defaults to a card surface. */
  surface?: boolean | "transparent";
  origin?: HTMLElement | null;
  /** Ordinary islands only: serializable content from which the owner can rebuild this island; absent for islands that exist only while open. */
  restore?: IslandView;
}

/** Presentation and renderer remain unchanged when the containing instance binds a different lookup key. */
type IslandContent = Omit<IslandSpec, "key">;

/** Ordinary island state: owner is the island that opened it; size is a fixed width chosen through the island menu, or null for the declared width. */
export interface StripIsland { id: string; key: string; owner: string | null; size: number | null; spec: IslandContent }
/**
 * focus null means the root. scope names the context the islands belong to, such as a session;
 * an owner persists the arrangement only while the scope is its own, so clearing islands for navigation is not recorded.
 * settle marks the latest change as a replacement of the root's content: remaining islands take their new place at once instead of moving.
 */
export interface StripState { islands: readonly StripIsland[]; focus: string | null; scope: string | null; settle: boolean }
/** settle: remaining islands jump to their new layout, for closes that accompany replacing the root's content. */
export interface CloseOptions { settle?: boolean }

/** Ordinary island strip of one screen: an external store so cards and persistence can observe open identities without rerendering the screen's owner. */
export class IslandStrip {
  private state: StripState = { islands: [], focus: null, scope: null, settle: false };
  private screen: ((id: string, force: boolean) => Promise<boolean>) | null = null;
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.state;
  findByKey(key: string): StripIsland | undefined { return this.state.islands.find(island => island.key === key); }
  has(key: string): boolean { return this.findByKey(key) !== undefined; }
  /** Every change animates unless it says otherwise. */
  set(next: Partial<StripState>) {
    this.state = { ...this.state, settle: false, ...next };
    for (const listener of this.listeners) listener();
  }
  /** Close an island and the islands it opened through the mounted screen; false when no screen shows this strip. */
  close(id: string, options?: { force?: boolean }): Promise<boolean> {
    return this.screen ? this.screen(id, options?.force ?? false) : Promise.resolve(false);
  }
  /** Locate content and close that instance; an absent key has nothing to close. */
  closeByKey(key: string, options?: { force?: boolean }): Promise<boolean> {
    const island = this.findByKey(key);
    return island ? this.close(island.id, options) : Promise.resolve(true);
  }
  /** Called by the screen showing this strip. */
  attach(close: (id: string, force: boolean) => Promise<boolean>): () => void {
    this.screen = close;
    return () => { if (this.screen === close) this.screen = null; };
  }
}

/** Explicit cancellation action of an island; independent of its ability to close. */
export type IslandCancel = () => void | Promise<void>;

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
  /** Stable instance identity, independent of its content lookup key. */
  readonly id: string;
  /** Current ordinary content key; null for the host-managed root. */
  readonly key: string | null;
  /** Whether an ordinary island with this content key is open in the screen. */
  has: (key: string) => boolean;
  /** Rebind this instance in place. An occupied key is reported and leaves the binding unchanged; absent instances return false. */
  bindKey: (key: string) => boolean;
  /** Open at the right end or locate by content key. Returns the shown instance and whether it was created, or null when the owner is absent. */
  open: (spec: IslandSpec) => Promise<{ id: string; opened: boolean } | null>;
  /** Close this island and the islands it opened, transitively (no effect on the root). force skips guards for invalid content. Resolves to whether it closed. */
  close: (options?: { force?: boolean }) => Promise<boolean>;
  /** Close the islands this island opened, transitively; with target, only that directly owned island and the islands it opened. */
  closeOwned: (options?: { force?: boolean; target?: string }) => Promise<boolean>;
  /** Register a close guard for this island and return an unregister function. Usually used through useCloseGuard. */
  guard: (guard: CloseGuard) => () => void;
  /** Register the island's cancellation action and return an unregister function. One owner declares this action. */
  onCancel: (action: IslandCancel) => () => void;
  /** Present on ordinary islands only. */
  arrangement?: IslandArrangement;
}
const IslandContext = createContext<IslandApi | null>(null);
const StripContext = createContext<IslandStrip | null>(null);
export interface ScreenHandle {
  /** Close every ordinary island; any refusal cancels. */
  closeAll(options?: CloseOptions): Promise<boolean>;
  /** Close an island of this screen as if through its own controls. */
  close(id: string, options?: CloseOptions): Promise<boolean>;
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
export function useIslandOpen(key: string): boolean {
  const strip = useContext(StripContext);
  if (!strip) throw new Error("useIslandOpen must be used inside a Screen.");
  return useSyncExternalStore(strip.subscribe, () => strip.has(key));
}

/** Bind a settings editor to its current saved identity; new entries keep their creation key until saving succeeds. */
export function useIslandKey(key: string) {
  const island = useIsland();
  useLayoutEffect(() => { island.bindKey(key); }, [island, key]);
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

/** Declare the containing island's cancellation action; null leaves it without an island-level Escape action. */
export function useIslandCancel(action: IslandCancel | null) {
  const island = useIsland();
  const latest = useRef(action);
  latest.current = action;
  const enabled = action !== null;
  useEffect(() => enabled ? island.onCancel(() => latest.current?.()) : undefined, [island, enabled]);
}

/** Effective width: a chosen size holds regardless of the window and may overflow into strip scrolling. */
function islandWidth(island: StripIsland): IslandWidth {
  return island.size === null ? island.spec.width : { min: island.size, max: island.size };
}
function mediumWidth(width: IslandWidth): number {
  return width.max ?? Math.round(width.min * 1.5);
}

/**
 * One Island viewport: the root followed by ordinary islands, left to right.
 * Ordinary islands open at the right end, swap through the island menu, and close with the islands they opened.
 * When all min widths fit, distribute by grow and center without translation; otherwise fall back to min and let the viewport follow focus.
 */
export function Screen({ label, root, strip: external, className, ref }: {
  label: string; root: IslandSpec; className?: string;
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
  const [scroll, setScroll] = useState<{ spans: readonly Span[] | null; focus: string; offset: number }>({ spans: null, focus: "", offset: 0 });
  const islands = useMemo<{ id: string; spec: IslandContent; width: IslandWidth; island?: StripIsland }[]>(() => [{ id: root.key, spec: root, width: root.width },
    ...state.islands.map(island => ({ id: island.id, spec: island.spec, width: islandWidth(island), island }))],
  [root, state.islands]);
  const focus = state.focus !== null && islands.some(item => item.id === state.focus) ? state.focus : root.key;
  const gap = windowGeometry.gap;

  useLayoutEffect(() => {
    // The strip fills the viewport width; horizontal spacing sits outside the viewport's clipping boundary.
    const element = stripElement.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Content-key changes do not change geometry or make the viewport follow focus again after manual scrolling.
  const slots = JSON.stringify(islands.map(item => ({ id: item.id, width: item.width })));
  const { spans, total, overflow } = useMemo(() => layout(JSON.parse(slots) as IslandSlot[], width, gap), [slots, width, gap]);
  const focusIndex = Math.max(0, islands.findIndex(item => item.id === focus));
  // Apply new layout constraints before rendering Islands, so viewport resizing and focus following share one geometry update.
  // Manual strip scrolling keeps its offset until the layout or focused island changes.
  const followChanged = scroll.spans !== spans || scroll.focus !== focus;
  const offset = followChanged ? (overflow ? follow(spans, focusIndex, width, scroll.offset) : 0) : scroll.offset;
  if (followChanged) setScroll({ spans, focus, offset });

  // Guards may asynchronously await confirmation while state changes: always decide using the latest state rather than the closure captured at initiation.
  const latest = useRef({ root, order: islands.map(item => item.id) });
  latest.current = { root, order: islands.map(item => item.id) };
  const guards = useRef(new Map<string, Set<CloseGuard>>());
  const pending = useRef(false);
  const cancellations = useRef(new Map<string, { action: IslandCancel; pending: boolean }>());
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
  const remove = (removed: readonly string[], settle = false) => {
    const current = strip.getSnapshot();
    const focused = current.focus !== null && known(current.focus) ? current.focus : latest.current.root.key;
    strip.set({ islands: removeIslands(current.islands, removed),
      focus: focusAfterClose(latest.current.order, removed, focused, latest.current.root.key), settle });
  };
  const open = async (owner: string, spec: IslandSpec) => {
    if (!known(owner)) return null;
    const current = strip.getSnapshot();
    const { key, ...content } = spec;
    const next = openIsland(current.islands, { id: crypto.randomUUID(), key, owner, size: null, spec: content });
    strip.set({ islands: next.islands, focus: next.island.id });
    // A located island receives focus here; a new one focuses itself after mounting.
    if (!next.opened) focusElement(next.island.id);
    return { id: next.island.id, opened: next.opened };
  };
  const bindKey = (id: string, key: string) => {
    const current = strip.getSnapshot();
    const result = bindIsland(current.islands, id, key);
    if (!result.ok) {
      if (result.reason === "occupied") toast.error(i18n.text(islandsMessages.alreadyOpen));
      return false;
    }
    if (result.islands !== current.islands) strip.set({ islands: result.islands });
    return true;
  };
  // AnimatePresence completes the exit animation before unmounting.
  const close = async (id: string, force?: boolean, settle?: boolean) => {
    if (id === latest.current.root.key) return false;
    const ordinary = strip.getSnapshot().islands.find(island => island.id === id);
    if (!ordinary) return false;
    if (!(await release(closure(strip.getSnapshot().islands, id), force))) return false;
    const removed = closure(strip.getSnapshot().islands, id);
    if (!removed.includes(id)) return true;
    remove(removed, settle);
    const origin = ordinary.spec.origin;
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
  const closeAll = async (settle?: boolean) => {
    const all = () => strip.getSnapshot().islands.map(island => island.id).reverse();
    if (!(await release(all()))) return false;
    remove(all(), settle);
    return true;
  };
  const guard = (id: string, fn: CloseGuard) => {
    const set = guards.current.get(id) ?? new Set();
    set.add(fn); guards.current.set(id, set);
    return () => { set.delete(fn); if (!set.size) guards.current.delete(id); };
  };
  const onCancel = (id: string, action: IslandCancel) => {
    if (cancellations.current.has(id)) throw new Error(`Island ${id} already has a cancellation action.`);
    const entry = { action, pending: false };
    cancellations.current.set(id, entry);
    return () => { cancellations.current.delete(id); };
  };
  const setFocus = (id: string) => { if (strip.getSnapshot().focus !== id) strip.set({ focus: id }); };
  const has = (id: string) => strip.has(id);
  // An identity absent from the screen has nothing to close.
  useImperativeHandle(ref, () => ({
    closeAll: options => closeAll(options?.settle),
    close: (id, options) => known(id) ? close(id, false, options?.settle) : Promise.resolve(true),
  }));
  const latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => strip.attach((id, force) => latestClose.current(id, force)), [strip]);

  const shift = overflow ? -offset : (width - total) / 2;
  const onWheel = (event: React.WheelEvent) => {
    if (!overflow || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if ((event.target as Element).closest(".island-body")) return; // Do not take over inside islands (including the canvas)
    setScroll(current => ({ ...current, offset: Math.min(Math.max(current.offset + event.deltaX, 0), total - width) }));
  };
  const onKeyDown = async (event: React.KeyboardEvent) => {
    // Local controls handle Escape first. Portal events belong to their own surface, not the island strip.
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || event.repeat
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || !event.currentTarget.contains(event.target as Node)) return;
    const cancellation = cancellations.current.get(focus);
    if (!cancellation) return;
    event.preventDefault(); event.stopPropagation();
    if (cancellation.pending) return;
    cancellation.pending = true;
    try { await cancellation.action(); }
    finally { cancellation.pending = false; }
  };
  /** Segmented navigation: focus the target island so the viewport follows it; move DOM focus only after the target is no longer inert. */
  const moveTo = (id: string) => { setFocus(id); focusElement(id); };
  const ordinaries = state.islands;

  return <StripContext.Provider value={strip}><div className={cn("weave-viewport", className)} aria-label={label} role="group" ref={viewport} onWheel={onWheel} onKeyDown={onKeyDown}>
    {/* Do not lay out islands until viewport width is measured, avoiding a frame of overflow layout at zero width. */}
    <div className="weave-strip" ref={stripElement} style={{ visibility: width ? undefined : "hidden" }}>
      {/* Each island is absolutely positioned and interpolates to its own target x and width: adding, removing, or swapping islands makes others smoothly move from their current positions. */}
      <AnimatePresence initial={false}>{islands.map(({ id, spec, island }, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - (overflow ? offset : 0), visibleRight = visibleLeft + span.width;
        const hidden = overflow && (visibleRight <= 0 || visibleLeft >= width);
        const peek = overflow && !hidden && (visibleLeft < -1 || visibleRight > width + 1);
        const position = island ? ordinaries.indexOf(island) : -1;
        return <Island key={id} spec={spec} width={span.width} x={span.left + shift} viewportWidth={width} settle={state.settle} hidden={hidden} peek={peek}
          focused={islands.length > 1 && id === focus}
          api={{
            id, key: island?.key ?? null, has, bindKey: key => bindKey(id, key),
            open: next => open(id, next),
            close: options => close(id, options?.force),
            closeOwned: options => closeOwned(id, options?.force, options?.target),
            guard: fn => guard(id, fn),
            onCancel: action => onCancel(id, action),
            arrangement: island && {
              size: island.size, medium: mediumWidth(island.spec.width),
              first: position === 0, last: position === ordinaries.length - 1,
              move: direction => { strip.set({ islands: moveIsland(strip.getSnapshot().islands, id, direction), focus: id }); focusElement(id); },
              resize: size => strip.set({ islands: strip.getSnapshot().islands.map(item => item.id === id ? { ...item, size } : item) }),
            },
          }}
          onFocus={() => setFocus(id)} />;
      })}</AnimatePresence>
    </div>
    {/* Segmented navigation during overflow: each segment corresponds to an island; clicking focuses it and the viewport follows, allowing even completely displaced islands to return into view. */}
    {overflow && <div className="weave-indicator">
      {islands.map(({ id, spec }, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - offset, visibleRight = visibleLeft + span.width;
        const visible = visibleRight > 0 && visibleLeft < width;
        const name = i18n.text(spec.label);
        return <Tooltip key={id}><TooltipTrigger asChild>
          <button type="button" className="weave-segment" aria-label={name} aria-current={id === focus || undefined}
            data-visible={visible || undefined}
            style={{ left: `${(span.left / total) * 100}%`, width: `${(span.width / total) * 100}%` }}
            onClick={() => moveTo(id)} />
        </TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>;
      })}
    </div>}
  </div></StripContext.Provider>;
}

function useStableIsland(api: IslandApi): IslandApi {
  const latest = useRef(api);
  latest.current = api;
  return useMemo(() => ({
    get id() { return latest.current.id; }, get key() { return latest.current.key; }, get arrangement() { return latest.current.arrangement; },
    has: key => latest.current.has(key), bindKey: key => latest.current.bindKey(key),
    open: spec => latest.current.open(spec), close: options => latest.current.close(options),
    closeOwned: options => latest.current.closeOwned(options), guard: fn => latest.current.guard(fn),
    onCancel: action => latest.current.onCancel(action),
  }), []);
}

function Island({ ref, spec, width, x, viewportWidth, settle, hidden, peek, focused, api, onFocus }: {
  ref?: React.Ref<HTMLElement>; spec: IslandContent; width: number; x: number; viewportWidth: number; settle: boolean; hidden: boolean; peek: boolean; focused: boolean; api: IslandApi; onFocus: () => void;
}) {
  const i18n = useI18n();
  const element = useRef<HTMLElement>(null);
  // Islands opened by content receive focus after mounting.
  useEffect(() => { if (spec.origin) element.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stable = useStableIsland(api);
  const latestFocus = useRef(onFocus);
  latestFocus.current = onFocus;
  const focusSelf = useCallback(() => latestFocus.current(), []);
  const surface = spec.surface ?? true;
  const reducedMotion = useReducedMotion();
  const [geometry, setGeometry] = useState({ x, width, viewportWidth, resized: false });
  if (geometry.x !== x || geometry.width !== width || geometry.viewportWidth !== viewportWidth) {
    // The viewport already moves continuously during Dock transitions and native resizing; do not animate behind it.
    setGeometry({ x, width, viewportWidth, resized: geometry.viewportWidth !== viewportWidth });
  }
  // For islands partially outside the viewport, clicking the exposed portion brings them into view.
  // Ordinary Island changes still interpolate from their current position and width.
  return <motion.section ref={node => { element.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
    initial={{ opacity: 0, x: x - 16, scale: 0.98, width }} animate={{ opacity: 1, x, scale: 1, width }} exit={{ opacity: 0, scale: 0.98, transition: fadeTransition }}
    transition={settle || geometry.resized || reducedMotion ? settledTransition : islandTransition} data-island={api.id} tabIndex={-1} aria-label={i18n.text(spec.label)}
    inert={hidden} aria-hidden={hidden || undefined} data-peek={peek || undefined} data-focused={focused || undefined}
    data-surface={surface || undefined}
    className="island"
    onFocusCapture={focusSelf} onPointerDownCapture={focusSelf}>
    {surface && <div className="island-backdrop" aria-hidden="true" />}
    <div className="island-body"><IslandContext.Provider value={stable}>{spec.render()}</IslandContext.Provider></div>
  </motion.section>;
}
