import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";

export interface HeaderExcerptProps {
  /** Full value. Only a bounded, single-line prefix is rendered; keep the full value in the body. */
  text: string;
  /** Inherit the title's font for prose, or opt into monospace for code. */
  font?: "inherit" | "mono";
}

export interface StreamingScrollAreaProps {
  children: ReactNode;
  /** Localized accessible name for the scrolling region. */
  label: string;
  /** Optional plugin layout class for the outer element. */
  className?: string;
  /** Used only at mount; keep the component mounted to preserve position when the content settles. Defaults to end. */
  initialScrollPosition?: "start" | "end";
}

interface RendererUi {
  HeaderExcerpt: ComponentType<HeaderExcerptProps>;
  StreamingScrollArea: ComponentType<StreamingScrollAreaProps>;
}

const Ui = createContext<RendererUi | null>(null);
/** Host binding for shared presentation controls. */
export const RendererUiProvider = Ui.Provider;
function useRendererUi(): RendererUi {
  const ui = useContext(Ui);
  if (!ui) throw new Error("Renderer UI controls must be provided by the host.");
  return ui;
}

/** An excerpt for a shrinkable title slot: up to 160 Unicode code points plus an ellipsis, then ellipsized to fit. */
export function HeaderExcerpt(props: HeaderExcerptProps) {
  return createElement(useRendererUi().HeaderExcerpt, props);
}

/** A bounded, selectable viewport that follows new content only at the end. Place stable context outside it. */
export function StreamingScrollArea(props: StreamingScrollAreaProps) {
  return createElement(useRendererUi().StreamingScrollArea, props);
}
