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
  /** Stable identity within the contributing group. */
  id: string;
  label: UiText;
  keywords?: readonly string[];
  icon?: ReactNode;
  /** False hides the command; omitted means visible. */
  when?: boolean;
  /** Disabled commands remain visible. */
  disabled?: boolean;
  /** Inline supplementary content, including action feedback. */
  detail?: ReactNode;
}

/** Actions own dismissal through context.close; controls are real interactive children, not selectable action rows. */
export type RendererCommand = RendererCommandBase & (
  | { onAction(): void; control?: never }
  | { control: ReactNode; onAction?: never }
);

export interface RendererCommandGroup {
  /** Stable identity within the contributing plugin; groups from different sources remain separate. */
  id: string;
  label: UiText;
  /** Runs as a hook in the plugin's calls and preferences scope while the application palette is open. */
  useCommands(context: RendererCommandContext): readonly RendererCommand[];
}
