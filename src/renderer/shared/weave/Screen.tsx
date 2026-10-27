import { motion, AnimatePresence } from "motion/react";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { windowGeometry } from "../../../shared/desktop";
import { cn } from "@asterism-app/ui/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";

import { fadeTransition, islandTransition } from "./motion";
import { closeIsland, focusIsland, follow, layout, openIsland, type IslandWidth } from "./model";

/** Island declaration: width, accessible name, and content. origin is the element that opened it, used for expansion animation and focus restoration. */
export interface IslandSpec {
  id: string;
  width: IslandWidth;
  label: UiText;
  render: () => ReactNode;
  /** When false, the island has no surface, and content sits directly on the window material. */
  surface?: boolean;
  origin?: HTMLElement | null;
}

/** Close guard: returning false (or resolving to false) cancels closing; can asynchronously await user confirmation. */
export type CloseGuard = () => boolean | Promise<boolean>;

export interface IslandApi {
  id: string;
  /** ID of the island to this island's right (one level deeper). */
  child?: string;
  /** Open a deeper island on this island's right, replacing existing deeper islands; replaced islands can refuse through guards. Resolves to whether it opened. */
  open: (spec: IslandSpec) => Promise<boolean>;
  /** Close this island and deeper islands (no effect on the root). force skips guards for invalid content (such as deleted content). Resolves to whether it closed. */
  close: (options?: { force?: boolean }) => Promise<boolean>;
  /** Close deeper islands to this island's right. */
  closeChild: (options?: { force?: boolean }) => Promise<boolean>;
  /** Register a close guard for this island and return an unregister function. Usually used through useCloseGuard. */
  guard: (guard: CloseGuard) => () => void;
}
const IslandContext = createContext<IslandApi | null>(null);
/** Use within island content. */
export function useIsland(): IslandApi {
  const api = useContext(IslandContext);
  if (!api) throw new Error("useIsland must be used inside a Screen island.");
  return api;
}

/**
 * Register a close guard for the containing island: consulted when closing this island, closing its parent, or opening another island from the parent to replace it.
 * A null guard allows closing; guards always use the latest callback, with no need to reregister on state changes.
 */
export function useCloseGuard(guard: CloseGuard | null) {
  const island = useIsland();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => island.guard(() => latest.current ? latest.current() : true), [island]);
}

/**
 * One screen: controlled islands can be declared to the left of the root; deeper islands to the root's right are managed through open/close.
 * When all min widths fit, distribute by grow and center without translation; otherwise fall back to min and let the viewport follow focus.
 */
export function Screen({ label, root, leading, className, resetKey }: {
  label: string; root: IslandSpec; leading?: IslandSpec[]; className?: string;
  /** Close all deeper islands when this changes. */ resetKey?: string;
}) {
  const i18n = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [deeper, setDeeper] = useState<IslandSpec[]>([]);
  const [focus, setFocus] = useState(root.id);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const islands = useMemo(() => [...(leading ?? []), root, ...deeper], [leading, root, deeper]);
  const gap = windowGeometry.gap;
  useEffect(() => { setDeeper([]); setFocus(root.id); }, [resetKey, root.id]);
  useEffect(() => {
    if (!islands.some(island => island.id === focus)) setFocus(root.id);
  }, [islands, focus, root.id]);

  useLayoutEffect(() => {
    // Layout width uses the strip width after subtracting --space-inset; the viewport itself fills the container.
    const element = strip.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { spans, total, overflow } = useMemo(() => layout(islands, width, gap), [islands, width, gap]);
  const focusIndex = Math.max(0, islands.findIndex(island => island.id === focus));
  // Follow focus only during overflow: stay still when visible and align to the edge when out of bounds; do not translate when everything fits.
  useLayoutEffect(() => { setOffset(current => overflow ? follow(spans, focusIndex, width, current) : 0); }, [spans, focusIndex, width, overflow]);

  // Controlled leading islands participate only in layout and focus, not in opening/closing parent-child islands.
  // Guards may asynchronously await confirmation while state changes: always decide using the latest state rather than the closure captured at initiation.
  const latest = useRef({ deeper, focus });
  latest.current = { deeper, focus };
  const current = () => ({ islands: [root, ...latest.current.deeper], focus: latest.current.focus });
  const guards = useRef(new Map<string, Set<CloseGuard>>());
  const pending = useRef(false);
  /** Consult islands to be removed from deepest to shallowest; any refusal cancels the operation. Ignore other close requests while consulting. */
  const release = async (removed: string[], force?: boolean): Promise<boolean> => {
    if (force || removed.length === 0) return true;
    if (pending.current) return false;
    pending.current = true;
    try {
      for (const id of [...removed].reverse()) {
        for (const guard of guards.current.get(id) ?? []) if (!(await guard())) return false;
      }
      return true;
    } finally { pending.current = false; }
  };
  const removedBy = (next: { islands: { id: string }[] }) =>
    latest.current.deeper.map(spec => spec.id).filter(id => !next.islands.some(island => island.id === id));
  const apply = (next: { islands: { id: string }[]; focus: string }, added?: IslandSpec) => {
    setDeeper(current => next.islands.slice(1).map(slot => added?.id === slot.id ? added : current.find(spec => spec.id === slot.id)!).filter(Boolean));
    setFocus(next.focus);
  };
  const open = async (parent: string, spec: IslandSpec) => {
    if (!current().islands.some(island => island.id === parent)) return false;
    if (!(await release(removedBy(openIsland(current(), parent, spec))))) return false;
    if (!current().islands.some(island => island.id === parent)) return false;
    apply(openIsland(current(), parent, spec), spec);
    return true;
  };
  // AnimatePresence completes the exit animation before unmounting.
  const close = async (id: string, force?: boolean) => {
    const spec = latest.current.deeper.find(item => item.id === id);
    if (!spec || id === root.id) return false;
    if (!(await release(removedBy(closeIsland(current(), id)), force))) return false;
    if (!latest.current.deeper.some(item => item.id === id)) return true;
    apply(closeIsland(current(), id));
    const target = spec.origin?.isConnected ? spec.origin : null;
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    return true;
  };
  const guard = (id: string, fn: CloseGuard) => {
    const set = guards.current.get(id) ?? new Set();
    set.add(fn); guards.current.set(id, set);
    return () => { set.delete(fn); if (!set.size) guards.current.delete(id); };
  };

  const shift = overflow ? -offset : (width - total) / 2;
  const onWheel = (event: React.WheelEvent) => {
    if (!overflow || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if ((event.target as Element).closest(".island-body")) return; // Do not take over inside islands (including the canvas)
    setOffset(current => Math.min(Math.max(current + event.deltaX, 0), total - width));
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    // The deepest screen handles Esc first: close the focused island; if only the root remains, defer to the outer layer.
    if (event.key !== "Escape" || event.defaultPrevented || !deeper.some(island => island.id === focus)) return;
    event.preventDefault(); event.stopPropagation();
    void close(focus);
  };
  /** Segmented navigation: focus the target island so the viewport follows it; move DOM focus only after the target is no longer inert. */
  const moveTo = (id: string) => {
    setFocus(current => focusIsland({ islands, focus: current }, id).focus);
    requestAnimationFrame(() => viewport.current?.querySelector<HTMLElement>(`[data-island="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
  };

  return <div className={cn("weave-viewport", className)} aria-label={label} role="group" ref={viewport} onWheel={onWheel} onKeyDown={onKeyDown}>
    {/* Do not lay out islands until viewport width is measured, avoiding a frame of overflow layout at zero width. */}
    <div className="weave-strip" ref={strip} style={{ visibility: width ? undefined : "hidden" }}>
      {/* Each island is absolutely positioned and interpolates to its own target x and width: adding or removing islands makes others smoothly yield from their current positions, without combining whole-strip translation and layout animation. */}
      <AnimatePresence initial={false}>{islands.map((island, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - (overflow ? offset : 0), visibleRight = visibleLeft + span.width;
        const hidden = overflow && (visibleRight <= 0 || visibleLeft >= width);
        const peek = overflow && !hidden && (visibleLeft < -1 || visibleRight > width + 1);
        return <Island key={island.id} spec={island} width={span.width} x={span.left + shift} hidden={hidden} peek={peek}
          focused={islands.length > 1 && island.id === focus}
          api={{
            id: island.id, child: islands[index + 1]?.id,
            open: spec => open(island.id, spec),
            close: options => close(island.id, options?.force),
            closeChild: async options => { const child = islands[index + 1]; return child ? close(child.id, options?.force) : true; },
            guard: fn => guard(island.id, fn),
          }}
          onFocus={() => setFocus(current => focusIsland({ islands, focus: current }, island.id).focus)} />;
      })}</AnimatePresence>
    </div>
    {/* Segmented navigation during overflow: each segment corresponds to an island; clicking focuses it and the viewport follows, allowing even completely displaced islands to return into view. */}
    {overflow && <div className="weave-indicator">
      {islands.map((island, index) => {
        const span = spans[index] ?? { left: 0, width: 0 };
        const visibleLeft = span.left - offset, visibleRight = visibleLeft + span.width;
        const visible = visibleRight > 0 && visibleLeft < width;
        const name = i18n.text(island.label);
        return <Tooltip key={island.id}><TooltipTrigger asChild>
          <button type="button" className="weave-segment" aria-label={name} aria-current={island.id === focus || undefined}
            data-visible={visible || undefined}
            style={{ left: `${(span.left / total) * 100}%`, width: `${(span.width / total) * 100}%` }}
            onClick={() => moveTo(island.id)} />
        </TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>;
      })}
    </div>}
  </div>;
}

function Island({ ref, spec, width, x, hidden, peek, focused, api, onFocus }: {
  ref?: React.Ref<HTMLElement>; spec: IslandSpec; width: number; x: number; hidden: boolean; peek: boolean; focused: boolean; api: IslandApi; onFocus: () => void;
}) {
  const i18n = useI18n();
  const element = useRef<HTMLElement>(null);
  // Islands opened by content receive focus after mounting.
  useEffect(() => { if (spec.origin) element.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(api);
  latest.current = api;
  const stable = useMemo<IslandApi>(() => ({
    get id() { return latest.current.id; }, get child() { return latest.current.child; },
    open: spec => latest.current.open(spec), close: options => latest.current.close(options),
    closeChild: options => latest.current.closeChild(options), guard: fn => latest.current.guard(fn),
  }), []);
  const focusSelf = useCallback(() => onFocus(), [onFocus]);
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
