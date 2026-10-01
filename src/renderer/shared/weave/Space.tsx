import type { CSSProperties, ReactNode } from "react";
import { cn } from "../utils";

/** 屏声明：Space 中的一站。surface=false 时无底板，内容直接位于窗口材质上。 */
export interface ScreenSpec { id: string; label: string; surface?: boolean; content: ReactNode }

/**
 * 受管空间：窗口内容区中唯一负责与窗口关系的层（内边距由 --space-inset 决定）。
 * 屏自左向右平铺（左浅右深），整屏平移切换；视口外的屏保持挂载但 inert。
 * 屏与浮岛只相对 Space 定位，不感知标题栏。
 */
export function Space({ screens, active, className }: { screens: ScreenSpec[]; active: string; className?: string }) {
  const index = Math.max(0, screens.findIndex(screen => screen.id === active));
  return <div className={cn("space", className)}>
    {/* 屏宽与间隙由 CSS 计算，平移用 transform 过渡，不依赖测量。 */}
    <div className="space-strip" style={{ "--screen-index": index } as CSSProperties}>
      {screens.map(screen => <section key={screen.id} id={`screen-${screen.id}`} tabIndex={-1} aria-label={screen.label}
        inert={screen.id !== active} aria-hidden={screen.id !== active || undefined}
        data-surface={screen.surface !== false || undefined} className="space-screen">
        {screen.content}
      </section>)}
    </div>
  </div>;
}
