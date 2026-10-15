import { IconButton } from "../../shared/ui/icon-button";

import { Card } from "../../shared/ui/card";
import { ChevronRight, ChevronDown, X } from "lucide-react";

import { commonMessages } from "../../messages/common";
import { useI18n } from "../../shared/i18n";
import { memo, type ReactNode } from "react";

import { cn } from "../../shared/utils";

import type { CardSize } from "../../../shared/workbench";

/** 卡片拖动柄选择器；画布只认它，卡片内容不感知拖动。 */
export const cardDragHandle = ".card-drag-handle";

export type ViewPatch = { hidden?: boolean; collapsed?: boolean; size?: CardSize | null };

/**
 * 对象卡片控件：官方 Card 外壳 + 拖动柄标题栏 + 折叠/关闭视图操作 + 不触发画布的内容区。
 * 所有对象种类共用；种类差异只在 icon、标题、额外操作与内容。
 */
export const ObjectCard = memo(function ObjectCard({ icon, kind, title, actions, collapsed, selected, onView, children }: {
  icon: ReactNode; kind: string; title: string; actions?: ReactNode;
  collapsed: boolean; selected: boolean;
  onView: (patch: ViewPatch) => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const toggleLabel = collapsed ? i18n.formatMessage(commonMessages.expand) : i18n.formatMessage(commonMessages.collapse);
  return <Card className={cn("w-full gap-0 overflow-hidden py-0", !collapsed && "h-full", selected && "border-ring")}>
    <header className="card-drag-handle flex shrink-0 cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
      <span className="text-muted-foreground" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="type-label truncate">{kind}</p>
        <h2 className="type-section mt-0.5 truncate">{title}</h2>
      </div>
      <div className="nodrag flex shrink-0 items-center gap-0.5">
        {actions}
        <IconButton size="icon-xs" label={toggleLabel} aria-expanded={!collapsed} onClick={() => onView({ collapsed: !collapsed })}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </IconButton>
        <IconButton size="icon-xs" label={i18n.formatMessage(commonMessages.closeView)} onClick={() => onView({ hidden: true })}><X /></IconButton>
      </div>
    </header>
    {!collapsed && <div className="nodrag nopan nowheel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t">{children}</div>}
  </Card>;
});
