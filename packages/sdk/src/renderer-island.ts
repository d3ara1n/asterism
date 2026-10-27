import { createContext, createElement, useContext, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";

/**
 * Island: an independent surface column within the host screen; opening one places it to the right of the current island and replaces existing deeper islands.
 * The host uniformly manages width, position, motion, and focus; plugins provide only identity, an accessible name, and content.
 */
export interface RendererIslandSpec {
  /** Island identity unique within the plugin; the host isolates it by plugin identity. Opening the same identity again replaces its content. */
  key: string;
  /** The island's accessible name and overflow navigation hint. */
  label: UiText;
  /** The element that opened it: used for the expansion animation and receives focus again after closing. */
  origin?: HTMLElement | null;
  render: () => ReactNode;
}
/** Close guard: returning false (or resolving to false) aborts closing; may asynchronously wait for user confirmation. */
export type RendererCloseGuard = () => boolean | Promise<boolean>;
export interface RendererIsland {
  /** Identities of deeper islands opened by this plugin to the right of this island. */
  readonly child: string | undefined;
  /** Open a deeper island to the right of this one; replaced islands may refuse through guards. Resolves to whether it opened. */
  open(spec: RendererIslandSpec): Promise<boolean>;
  /** Close this island and deeper islands; has no effect on the host-managed island containing the plugin settings page. force skips guards. */
  close(options?: { force?: boolean }): Promise<boolean>;
  /** Close deeper islands to the right of this one. */
  closeChild(options?: { force?: boolean }): Promise<boolean>;
  /** Register a close guard for this island and return an unregister function. Normally used through useRendererCloseGuard. */
  guard(guard: RendererCloseGuard): () => void;
}
/**
 * Panel island frame: the title bar stays fixed and the content scrolls independently; the primary action and close control sit on the right of the title bar.
 * When dirty is true, the host asks for confirmation to discard changes before closing this island, including through ancestor closure or replacement.
 */
export interface RendererIslandPanelProps {
  title: string;
  description?: string;
  /** Primary title bar action, such as save. */
  action?: ReactNode;
  /** Fixed toolbar below the title bar, such as search. */
  toolbar?: ReactNode;
  dirty?: boolean;
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
/** The containing island; available within plugin settings pages and islands they open. */
export function useRendererIsland(): RendererIsland { return required(useContext(Island), "island"); }
/** Register a close guard for the containing island; null guard permits closing, and the guard always uses the latest callback. */
export function useRendererCloseGuard(guard: RendererCloseGuard | null) {
  const island = useRendererIsland();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => island.guard(() => latest.current ? latest.current() : true), [island]);
}
/** Host-rendered panel frame for use within islands opened by plugins. */
export function IslandPanel(props: RendererIslandPanelProps) {
  return createElement(required(useContext(Panel), "island panel"), props);
}
