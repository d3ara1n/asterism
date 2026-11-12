import { createContext, createElement, useContext, useEffect, useLayoutEffect, useRef, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";

/**
 * Island: an independent window-like surface within the host screen. Islands open at the right end of the screen and belong to the island that opened them;
 * closing an island also closes the islands it opened. The host manages order, width, position, motion, and focus; plugins provide identity, an accessible name, and content.
 */
export interface RendererIslandSpec {
  /** Initial content lookup key unique within the plugin. Opening an already bound key locates that island and keeps its content. */
  key: string;
  /** The island's accessible name and overflow navigation hint. */
  label: UiText;
  /** The element that opened it: used for the expansion animation and receives focus again after closing. */
  origin?: HTMLElement | null;
  /** Content surfaces grow wider than the default form panel. */
  size?: "panel" | "content";
  render: () => ReactNode;
}
/** Explicit cancellation action of an island; cancellation may close it through the usual close guards. */
export type RendererIslandCancel = () => void | Promise<void>;
/** Close guard: returning false (or resolving to false) aborts closing; may asynchronously wait for user confirmation. */
export type RendererCloseGuard = () => boolean | Promise<boolean>;
export interface RendererIsland {
  /** Whether an island with this plugin key is open in the screen. */
  has(key: string): boolean;
  /** Bind this island to a new content key without remounting or changing layout, ownership, focus, or close guards.
   * An occupied key is reported by the host and returns false without changing either island; absent, host-managed, or other-plugin islands return false.
   */
  bindKey(key: string): boolean;
  /** Open an island owned by this one at the right end of the screen, or locate the open island with the same key. Resolves to whether it is shown. */
  open(spec: RendererIslandSpec): Promise<boolean>;
  /** Close this island and the islands it opened; has no effect on host-managed islands such as the one containing a plugin settings page. force skips guards. */
  close(options?: { force?: boolean }): Promise<boolean>;
  /** Close the islands this island opened, transitively. */
  closeOwned(options?: { force?: boolean }): Promise<boolean>;
  /** Register a close guard for this island and return an unregister function. Normally used through useRendererCloseGuard. */
  guard(guard: RendererCloseGuard): () => void;
  /** Register the containing island's cancellation action. One owner declares this action; unregister on cleanup. */
  onCancel(action: RendererIslandCancel): () => void;
}
/**
 * Panel island frame: the title bar stays fixed and the content scrolls independently; the primary action, island menu, and close control sit on the right of the title bar.
 * When dirty is true, the host asks for confirmation to discard changes before closing this island, including closure through the island that opened it.
 */
export interface RendererIslandPanelProps {
  title: string;
  description?: string;
  /** What the content belongs to, shown before the title, such as a reference chip for its resource or skill. */
  source?: ReactNode;
  /** Primary title bar action, such as save. */
  action?: ReactNode;
  /** Fixed toolbar below the title bar, such as search. */
  toolbar?: ReactNode;
  dirty?: boolean;
  /** Fill the available area without padding; the content owns scrolling. */
  layout?: "padded" | "fill";
  children: ReactNode;
}

const Island = createContext<RendererIsland | null>(null);
const Panel = createContext<ComponentType<RendererIslandPanelProps> | null>(null);
export const RendererIslandProvider = Island.Provider;
export const RendererIslandPanelProvider = Panel.Provider;
function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Renderer ${name} must be provided by the host.`);
  return value;
}
/** Available within resource cards, plugin settings pages, and islands they open. Opened content has its own region; pass domain inputs explicitly. */
export function useRendererIsland(): RendererIsland { return required(useContext(Island), "island"); }
/** Keep an editor bound to its current persisted identity. Use a distinct creation key until the first successful save. */
export function useRendererIslandKey(key: string) {
  const island = useRendererIsland();
  useLayoutEffect(() => { island.bindKey(key); }, [island, key]);
}
/** Register a close guard for the containing island; null guard permits closing, and the guard always uses the latest callback. */
export function useRendererCloseGuard(guard: RendererCloseGuard | null) {
  const island = useRendererIsland();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => island.guard(() => latest.current ? latest.current() : true), [island]);
}
/** Declare cancellation for an island owned by this content; null leaves it without an island-level Escape action.
 * Escape targets only the focused island, after local controls; it does not fall back to the opening island.
 * Declare one action per island. Closing capability and the panel frame do not imply cancellation.
 */
export function useRendererIslandCancel(action: RendererIslandCancel | null) {
  const island = useRendererIsland();
  const latest = useRef(action);
  latest.current = action;
  const enabled = action !== null;
  useEffect(() => enabled ? island.onCancel(() => latest.current?.()) : undefined, [island, enabled]);
}
/** Host-rendered panel frame for use within islands opened by plugins. */
export function IslandPanel(props: RendererIslandPanelProps) {
  return createElement(required(useContext(Panel), "island panel"), props);
}
