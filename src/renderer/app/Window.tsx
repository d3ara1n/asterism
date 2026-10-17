import type { CSSProperties, ReactNode } from "react";

import { windowGeometry } from "../../shared/desktop";
import { appMessages } from "../messages/app";
import { objectsMessages } from "../messages/objects";
import { useI18n } from "../shared/i18n";
import { useDesktopWindow } from "./window-state";

const geometry = {
  "--window-gutter": `${windowGeometry.gutter}px`,
  "--window-gap": `${windowGeometry.gap}px`,
  // 窗口边距由 Space 内的滚动容器提供，滚动条与指示条因此贴住窗口边缘。
  "--space-inset": `${windowGeometry.gutter}px`,
  "--window-header-height": `${windowGeometry.headerHeight}px`,
  // 导航部件内：按钮组左侧留白与右侧留白相等。
  "--mac-controls-inset": `${2 * windowGeometry.macControlsPosition.x - 2 * windowGeometry.gutter + windowGeometry.macControlsWidth}px`,
} as CSSProperties;

/**
 * 窗口：组合 Titlebar 与 Space，并处理平台差异（原生控件留白、拖动区域）。
 * 原生材质由主进程绘制；本层无不透明底色。全屏或浮动标题栏只改这里两者的排布。
 */
export function Window({ titlebar, children, skipTarget }: { titlebar: ReactNode; children: ReactNode; skipTarget: string }) {
  const i18n = useI18n();
  const state = useDesktopWindow();
  return <main className="window" data-titlebar={state.titleBar} data-fullscreen={state.fullScreen} style={geometry}>
    <a href={`#${skipTarget}`} className="skip-link">{i18n.formatMessage(appMessages.skipToContent)}</a>
    {titlebar}
    {children}
  </main>;
}

/** 全局标题栏：不随屏平移。左侧导航，右侧操作（可隐藏但保留占位）。 */
export function Titlebar({ navigation, actions, actionsHidden }: { navigation: ReactNode; actions?: ReactNode; actionsHidden?: boolean }) {
  const i18n = useI18n();
  return <header className="titlebar">
    <nav aria-label={i18n.formatMessage(appMessages.workspaceNavigation)} className="window-part window-navigation">{navigation}</nav>
    {actions && <nav aria-label={i18n.formatMessage(objectsMessages.objectActions)} aria-hidden={actionsHidden || undefined} inert={actionsHidden} data-hidden={actionsHidden} className="window-part window-actions">
      {actions}
    </nav>}
  </header>;
}
