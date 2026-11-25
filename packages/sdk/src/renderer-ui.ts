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

export interface DiffProps {
  /** Unified diff text of one file, with `---`/`+++` headers and `@@` hunks. */
  diff: string;
  /** Wrap long lines instead of scrolling horizontally. Defaults to true. */
  wrap?: boolean;
  /** Emphasize changed words within changed lines, in addition to marking the lines themselves. Defaults to "none". */
  highlightChanges?: "none" | "word";
  /** Infer syntax highlighting from the filename, or render hunk contents as plain text. Defaults to "auto". */
  syntax?: "auto" | "plain";
  /** Show old and new line numbers; defaults to true. Turn them off when the hunk positions are not real file positions. */
  lineNumbers?: boolean;
}

interface RendererUi {
  HeaderExcerpt: ComponentType<HeaderExcerptProps>;
  StreamingScrollArea: ComponentType<StreamingScrollAreaProps>;
  ToolHeader: ComponentType<ToolHeaderProps>;
  ToolResourceSubject: ComponentType<ToolResourceSubjectProps>;
  ToolScrollArea: ComponentType<ToolScrollAreaProps>;
  Diff: ComponentType<DiffProps>;
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

/** The default bounded reading region for settled tool content. Use your own layout when it doesn't fit the view. */
export function ToolScrollArea(props: ToolScrollAreaProps) {
  return createElement(useRendererUi().ToolScrollArea, props);
}

/** Optional single-file diff viewer. The caller owns its controls and layout. Patches without renderable hunks display as diff text. */
export function Diff(props: DiffProps) {
  return createElement(useRendererUi().Diff, props);
}
