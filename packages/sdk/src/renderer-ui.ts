import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { ToolInvocationInfo } from "./tool-result.ts";

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

/** One-line tool title: the operation name, then an optional subject badge, a summary that yields space first, and trailing metadata. */
export interface ToolHeaderProps {
  /** Localized operation name. */
  label: string;
  /** The operation's focus, such as a `ToolResourceSubject`; omit it when there is none. */
  subject?: ReactNode;
  /** Muted details such as a path or query; ellipsized as the width shrinks. */
  summary?: ReactNode;
  /** Short trailing facts such as counts; stays visible. */
  meta?: ReactNode;
}

export interface ToolResourceSubjectProps {
  /** The resource recorded with the call, from `invocation.resource`. */
  resource: NonNullable<ToolInvocationInfo["resource"]>;
}

export interface ToolScrollAreaProps {
  children: ReactNode;
  /** Localized accessible name for the scrolling region. */
  label: string;
}

export interface CodeDiffProps {
  /** Unified diff text of one file, with `---`/`+++` headers and `@@ -a,b +c,d @@` hunk headers. The file name selects highlighting. */
  diff: string;
  /** Show old and new line numbers; defaults to true. Turn them off when the hunk positions are not real file positions. */
  lineNumbers?: boolean;
}

interface RendererUi {
  HeaderExcerpt: ComponentType<HeaderExcerptProps>;
  StreamingScrollArea: ComponentType<StreamingScrollAreaProps>;
  ToolHeader: ComponentType<ToolHeaderProps>;
  ToolResourceSubject: ComponentType<ToolResourceSubjectProps>;
  ToolScrollArea: ComponentType<ToolScrollAreaProps>;
  CodeDiff: ComponentType<CodeDiffProps>;
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

/** The shared tool title layout. Use `HeaderExcerpt` in the summary for unbounded inputs. */
export function ToolHeader(props: ToolHeaderProps) {
  return createElement(useRendererUi().ToolHeader, props);
}

/** The recorded name and kind icon of the resource a call operated on, for a tool header's subject slot. */
export function ToolResourceSubject(props: ToolResourceSubjectProps) {
  return createElement(useRendererUi().ToolResourceSubject, props);
}

/** A bounded reading region for settled content; the host owns its height, and content beyond it scrolls inside. */
export function ToolScrollArea(props: ToolScrollAreaProps) {
  return createElement(useRendererUi().ToolScrollArea, props);
}

/** Unified diff of one file in the shared code presentation. Text that does not parse as one file diff renders as plain diff text. */
export function CodeDiff(props: CodeDiffProps) {
  return createElement(useRendererUi().CodeDiff, props);
}
