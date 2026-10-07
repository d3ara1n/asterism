import type { ReactNode } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { Button } from "../../shared/ui/button";
import { Card } from "../../shared/ui/card";
import { cn } from "../../shared/utils";
import { t } from "../../shared/i18n";

/** 卡片拖动柄选择器；画布只认它，卡片内容不感知拖动。 */
export const cardDragHandle = ".card-drag-handle";

/**
 * 对象卡片控件：官方 Card 外壳 + 拖动柄标题栏 + 折叠/关闭视图操作 + 不触发画布的内容区。
 * 所有对象种类共用；种类差异只在 icon、标题、额外操作与内容。
 */
export function ObjectCard({ icon, kind, title, actions, collapsed, historical, selected, width, height, onView, children }: {
  icon: ReactNode; kind: string; title: string; actions?: ReactNode;
  collapsed: boolean; historical: boolean; selected: boolean;
  /** 卡片尺寸是画布内的设计常量，不随所在浮岛宽度变化。 */
  width: number; height?: number;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void; children: ReactNode;
}) {
  return <Card className={cn("gap-0 overflow-hidden py-0", selected && "border-ring")} style={{ width, height: collapsed ? undefined : height }}>
    <header className="card-drag-handle flex shrink-0 cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
      <span className="text-muted-foreground" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="type-label">{kind}</p>
        <h2 className="type-section mt-0.5 truncate">{title}</h2>
      </div>
      <div className="nodrag flex items-center gap-0.5">
        {actions}
        <Button variant="ghost" size="icon-xs" aria-label={collapsed ? t.expand : t.collapse} title={collapsed ? t.expand : t.collapse} disabled={historical} onClick={() => onView({ collapsed: !collapsed })}>{collapsed ? <Maximize2 /> : <Minus />}</Button>
        <Button variant="ghost" size="icon-xs" aria-label={t.closeView} title={t.closeView} disabled={historical} onClick={() => onView({ hidden: true })}><X /></Button>
      </div>
    </header>
    {!collapsed && <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col border-t">{children}</div>}
  </Card>;
}
