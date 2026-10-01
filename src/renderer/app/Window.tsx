import type { CSSProperties, ReactNode } from "react";
import { windowGeometry } from "../../shared/desktop";
import { t } from "../shared/i18n";

const geometry = {
  "--window-gutter": `${windowGeometry.gutter}px`,
  "--window-gap": `${windowGeometry.gap}px`,
  "--window-header-height": `${windowGeometry.headerHeight}px`,
  // 导航部件内：按钮组左侧留白与右侧留白相等。
  "--mac-controls-inset": `${2 * windowGeometry.macControlsPosition.x - 2 * windowGeometry.gutter + windowGeometry.macControlsWidth}px`,
} as CSSProperties;

/**
 * 窗口：组合 Titlebar 与 Space，并处理平台差异（原生控件留白、拖动区域）。
 * 原生材质由主进程绘制；本层无不透明底色。全屏或浮动标题栏只改这里两者的排布。
 */
export function Window({ titlebar, children, skipTarget }: { titlebar: ReactNode; children: ReactNode; skipTarget: string }) {
  return <main className="window" data-platform={window.weft.platform} style={geometry}>
    <a href={`#${skipTarget}`} className="skip-link">{t.skipToContent}</a>
    {titlebar}
    {children}
  </main>;
}

/** 全局标题栏：不随屏平移。左侧导航，右侧操作（可隐藏但保留占位）。 */
export function Titlebar({ navigation, actions, actionsHidden }: { navigation: ReactNode; actions?: ReactNode; actionsHidden?: boolean }) {
  return <header className="titlebar">
    <nav aria-label={t.workspaceNavigation} className="window-part window-navigation">{navigation}</nav>
    {actions && <nav aria-label={t.objectActions} aria-hidden={actionsHidden || undefined} inert={actionsHidden} data-hidden={actionsHidden} className="window-part window-actions">
      {actions}
    </nav>}
  </header>;
}
