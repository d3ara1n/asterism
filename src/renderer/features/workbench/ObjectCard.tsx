import type { CardPanelView } from "@atelier/sdk/renderer";
import { ChevronRight, ChevronDown } from "lucide-react";
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";

import { commonMessages } from "@atelier/ui/messages/common";
import { useI18n } from "../../shared/i18n";
import { Card } from "@atelier/ui/ui/card";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { cn } from "@atelier/ui/utils";
import type { CardSize } from "../../../shared/workbench";
import { ObjectSurface } from "./ObjectSurface";

/** 卡片拖动柄选择器；画布只认它，卡片内容不感知拖动。 */
export const cardDragHandle = ".card-drag-handle";
export type ViewPatch = { collapsed?: boolean; size?: CardSize | null };

/** 画布上的对象容器：在公共外壳外加拖动柄、折叠与画布滚轮归属。 */
export const ObjectCard = memo(function ObjectCard({ icon, kind, title, actions, controls, panels, collapsed, selected, onView, children }: {
  icon: ReactNode; kind: string; title: string; actions?: ReactNode; controls?: ReactNode; panels?: readonly CardPanelView[];
  collapsed: boolean; selected: boolean;
  onView: (patch: ViewPatch) => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // React Flow 在原生冒泡阶段处理 wheel；React onWheel 执行时已晚于画布。只接管内容区的滚轮。
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-object-content]")) return;
      const zoom = event.ctrlKey || (window.host.platform === "darwin" && event.metaKey);
      // 普通滚动保留浏览器默认行为；已被内部组件消费的事件不再交给画布。
      if (!zoom || event.defaultPrevented) event.stopPropagation();
    };
    element.addEventListener("wheel", onWheel, { passive: true });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
  const expand = useCallback(() => onView({ collapsed: false }), [onView]);
  const toggleLabel = collapsed ? i18n.text(commonMessages.expand) : i18n.text(commonMessages.collapse);
  return <Card ref={root} className={cn("isolate w-full gap-0 overflow-hidden py-0", !collapsed && "h-full", selected && "border-ring")}>
    <ObjectSurface icon={icon} kind={kind} title={title} actions={actions} panels={panels} collapsed={collapsed} onExpand={expand}
      headerClassName="card-drag-handle cursor-grab active:cursor-grabbing"
      controls={<>{controls}<IconButton size="icon-xs" label={toggleLabel} aria-expanded={!collapsed} onClick={() => onView({ collapsed: !collapsed })}>
        {collapsed ? <ChevronRight /> : <ChevronDown />}
      </IconButton></>}>
      {children}
    </ObjectSurface>
  </Card>;
});
