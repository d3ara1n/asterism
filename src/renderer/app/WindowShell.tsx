import type { CSSProperties, ReactNode, Ref } from "react";
import { windowGeometry } from "../../shared/desktop";

interface WindowShellProps {
  navigation: ReactNode;
  actions: ReactNode;
  workbenchRef: Ref<HTMLElement>;
  children: ReactNode;
}

const geometry = {
  "--window-gutter": `${windowGeometry.gutter}px`,
  "--window-gap": `${windowGeometry.gap}px`,
  "--window-header-height": `${windowGeometry.headerHeight}px`,
  "--mac-controls-width": `${windowGeometry.macControlsWidth}px`,
} as CSSProperties;

/** 原生材质由主进程绘制；这里仅摆放独立表面并留出窗口间隙。 */
export function WindowShell({ navigation, actions, workbenchRef, children }: WindowShellProps) {
  return <main className="window-shell" data-platform={window.weft.platform} style={geometry}>
    <a href="#workbench" className="skip-link">Skip to workbench · 跳转工作台</a>
    <header className="window-header">
      <nav aria-label="Workspace navigation · 工作区导航" className="window-part window-navigation">
        {navigation}
      </nav>
      {actions && <nav aria-label="Object actions · 对象操作" className="window-part window-actions">
        {actions}
      </nav>}
    </header>
    <section ref={workbenchRef} id="workbench" tabIndex={-1} aria-label="Workbench · 工作台" className="workbench-surface">
      {children}
    </section>
  </main>;
}
