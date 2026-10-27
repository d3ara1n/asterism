import { createContext, createElement, useContext, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { pluginOf, pluginNamespace, type ThinkingLevel, type UiText } from "@asterism/sdk/contracts";
import type { AgentSelection } from "./configuration.ts";
import type { CatalogModel } from "./catalogs.ts";

/** One instance mounts per expanded Agent card; obtains the associated object through SDK useRendererObject. */
export interface AgentUIContribution {
  readonly id: string;
  readonly Component: ComponentType;
}

/** The frontend registry shared by the built-in implementation and consumers; business state remains owned by the contributing plugin. */
function createAgentUIRegistry() {
  let entries: readonly AgentUIContribution[] = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Register in renderer.prepare; released through signal on preparation failure, timeout, or application exit. */
    register(contribution: AgentUIContribution, { signal }: { signal: AbortSignal }): () => void {
      signal.throwIfAborted();
      const plugin = pluginOf(contribution.id);
      if (!plugin) throw new Error(`Agent UI contribution needs a namespaced ID: ${contribution.id}`);
      pluginNamespace(plugin).name(contribution.id.slice(plugin.length + 1));
      if (entries.some(entry => entry.id === contribution.id))
        throw new Error(`Duplicate Agent UI contribution: ${contribution.id}`);
      const entry = Object.freeze({ ...contribution });
      const remove = () => {
        signal.removeEventListener("abort", remove);
        if (!entries.includes(entry)) return;
        entries = entries.filter(value => value !== entry);
        notify();
      };
      signal.addEventListener("abort", remove, { once: true });
      entries = [...entries, entry];
      notify();
      return remove;
    },
  };
}

export const agentUI = createAgentUIRegistry();

/** The current selection and catalog resolution result; does not represent the model used by an executing request and contains no credentials. */
export interface AgentModelSelection {
  readonly selection: Readonly<AgentSelection> | null;
  readonly reference: string | null;
  readonly model: Readonly<CatalogModel> | null;
  readonly thinking: ThinkingLevel | null;
}
const ModelSelection = createContext<AgentModelSelection | null>(null);
/** The built-in Agent injects a read-only selection for the same card and all its contributions. */
export const AgentModelSelectionProvider = ModelSelection.Provider;
export function useAgentModelSelection(): AgentModelSelection {
  const selection = useContext(ModelSelection);
  if (!selection) throw new Error("Agent model selection must be read inside an Agent card.");
  return selection;
}

export interface AgentToolbarItemProps {
  children: ReactNode;
}
export type AgentOverlayPosition = "top" | "center" | "bottom";
export interface AgentOverlayProps {
  position: AgentOverlayPosition;
  /** Hides and disables the input area while the UI exists; multiple requests are combined with OR. */
  hideComposer?: boolean;
  children: ReactNode;
}
export interface AgentModalProps {
  open: boolean;
  title: UiText;
  description?: UiText;
  /** Wide content, such as proposal comparisons, can explicitly use a wider standard modal. */
  size?: "default" | "wide";
  /** Closing is only a UI intent; the plugin decides whether to end the business wait. No close control is provided when omitted. */
  onOpenChange?(open: boolean): void;
  hideComposer?: boolean;
  children: ReactNode;
}
/** The standard scroll viewport within an overlay/modal; the built-in implementation consistently reserves space for control focus rings. */
export interface AgentScrollAreaProps extends ComponentProps<"div"> {
  axis?: "vertical" | "horizontal" | "both";
}

/** The built-in Agent injects the layout implementation; the public package does not depend on implementation packages or control libraries. */
export interface AgentUIRenderer {
  ToolbarItem: ComponentType<AgentToolbarItemProps>;
  Overlay: ComponentType<AgentOverlayProps>;
  Modal: ComponentType<AgentModalProps>;
  ScrollArea: ComponentType<AgentScrollAreaProps>;
}
const Renderer = createContext<AgentUIRenderer | null>(null);
export const AgentUIRendererProvider = Renderer.Provider;
function useAgentUIRenderer(): AgentUIRenderer {
  const renderer = useContext(Renderer);
  if (!renderer) throw new Error("Agent UI must be rendered inside an Agent card.");
  return renderer;
}
export function AgentOverlay(props: AgentOverlayProps): ReactNode {
  return createElement(useAgentUIRenderer().Overlay, props);
}
export function AgentToolbarItem(props: AgentToolbarItemProps): ReactNode {
  return createElement(useAgentUIRenderer().ToolbarItem, props);
}
export function AgentModal(props: AgentModalProps): ReactNode {
  return createElement(useAgentUIRenderer().Modal, props);
}
export function AgentScrollArea(props: AgentScrollAreaProps): ReactNode {
  return createElement(useAgentUIRenderer().ScrollArea, props);
}
