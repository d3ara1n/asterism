import type { ReactNode } from "react";
import type { UiText } from "./i18n.ts";
import type { RendererSessionSnapshot } from "./renderer-session.ts";

/** Application command context, independent of any resource or Agent view. */
export interface RendererCommandContext {
  /** The session being viewed; null on Home or in application settings. */
  readonly session: RendererSessionSnapshot | null;
  /** Whether that session can accept operations; false outside a session. */
  readonly ready: boolean;
  /** Dismiss the palette, for example after a successful action. */
  close(): void;
}

export interface RendererCommandBase {
  /** Stable non-empty trimmed identity, unique among siblings. */
  id: string;
  label: UiText;
  keywords?: readonly string[];
  icon?: ReactNode;
  /** False hides the command; omitted means visible. */
  when?: boolean;
  /** Disabled commands remain visible; a disabled page also disables its descendants. */
  disabled?: boolean;
  /** Read-only supplementary content, including action feedback; contains no interactive controls. */
  detail?: ReactNode;
  /** Marks the saved/current choice independently of keyboard navigation highlight. */
  current?: boolean;
}

/** An entry executes an action or opens a nested command page. Actions own dismissal through context.close. */
export type RendererCommand = RendererCommandBase & (
  | { onAction(): void; children?: never }
  | { children: readonly RendererCommand[]; onAction?: never }
);

export interface RendererCommandGroup {
  /** Stable group identity within the contributing plugin. */
  id: string;
  label: UiText;
  /** Runs as a hook in the plugin's calls and preferences scope while the application palette is open, including nested pages. */
  useCommands(context: RendererCommandContext): readonly RendererCommand[];
}
