import { useLayoutEffect, type CSSProperties, type ReactNode } from "react";

import { windowGeometry } from "../../shared/desktop";
import { appMessages } from "../messages/app";
import { objectsMessages } from "../messages/objects";
import { useI18n } from "../shared/i18n";
import { useDesktopWindow } from "./window-state";

const geometry = {
  "--window-gutter": `${windowGeometry.gutter}px`,
  "--window-gap": `${windowGeometry.gap}px`,
  // The scroll container inside Space provides window margins, keeping scrollbars and indicators against the window edges.
  "--space-inset": `${windowGeometry.gutter}px`,
  "--window-header-height": `${windowGeometry.headerHeight}px`,
  // Within the navigation component: spacing to the left of the button group equals spacing to its right.
  "--mac-controls-inset": `${2 * windowGeometry.macControlsPosition.x - 2 * windowGeometry.gutter + windowGeometry.macControlsWidth}px`,
} as CSSProperties;

/**
 * Window: composes Titlebar and Space and handles platform differences (spacing for native controls and drag regions).
 * The main process draws the native material; this layer has no opaque background. Fullscreen or floating titlebars change only their arrangement here.
 */
export function Window({ titlebar, children, skipTarget }: { titlebar: ReactNode; children: ReactNode; skipTarget: string }) {
  const i18n = useI18n();
  const state = useDesktopWindow();
  useLayoutEffect(() => {
    if (!state.exiting) return;
    // Include portaled menus and dialogs without adding a visual layer or disabling the native window.
    document.body.inert = true;
    const blockShortcut = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
    window.addEventListener("keydown", blockShortcut, true);
    return () => {
      document.body.inert = false;
      window.removeEventListener("keydown", blockShortcut, true);
    };
  }, [state.exiting]);
  return <main className="window" data-titlebar={state.titleBar} data-fullscreen={state.fullScreen} aria-busy={state.exiting || undefined} style={geometry}>
    <fieldset disabled={state.exiting} className="contents">
      <a href={`#${skipTarget}`} className="skip-link">{i18n.formatMessage(appMessages.skipToContent)}</a>
      {titlebar}
      {children}
    </fieldset>
  </main>;
}

/** Global titlebar: does not slide with screens. Navigation on the left, actions on the right (can be hidden while retaining space). */
export function Titlebar({ navigation, actions, actionsHidden }: { navigation: ReactNode; actions?: ReactNode; actionsHidden?: boolean }) {
  const i18n = useI18n();
  return <header className="titlebar">
    <nav aria-label={i18n.formatMessage(appMessages.workspaceNavigation)} className="window-part window-navigation">{navigation}</nav>
    {actions && <nav aria-label={i18n.formatMessage(objectsMessages.objectActions)} aria-hidden={actionsHidden || undefined} inert={actionsHidden} data-hidden={actionsHidden} className="window-part window-actions">
      {actions}
    </nav>}
  </header>;
}
