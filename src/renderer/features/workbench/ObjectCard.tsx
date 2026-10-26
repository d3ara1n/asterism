import type { CardPanelView } from "@asterism/sdk/renderer";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";

import { commonMessages } from "@asterism/ui/messages/common";
import { useI18n } from "../../shared/i18n";
import { fadeTransition } from "../../shared/weave/motion";
import { Card } from "@asterism/ui/ui/card";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { cn } from "@asterism/ui/utils";
import type { CardSize } from "../../../shared/workbench";
import { ObjectSurface } from "./ObjectSurface";

/** 卡片拖动柄选择器；画布只认它，卡片内容不感知拖动。 */
export const cardDragHandle = ".card-drag-handle";
export type ViewPatch = { collapsed?: boolean; size?: CardSize | null };
/** Card 上下各一条 1px 边框；外壳高度按边框内尺寸计算。 */
const cardBorderBlock = 2;

/** 画布上的对象容器：在公共外壳外加拖动柄、折叠与画布滚轮归属。 */
export const ObjectCard = memo(function ObjectCard({ icon, kind, title, actions, controls, panels, collapsed, expandedHeight, resizing, selected, onView, children }: {
  icon: ReactNode; kind: string; title: string; actions?: ReactNode; controls?: ReactNode; panels?: readonly CardPanelView[];
  collapsed: boolean; selected: boolean;
  expandedHeight: number; resizing: boolean;
  onView: (patch: ViewPatch) => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const reducedMotion = useReducedMotion();
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
  return <Card ref={root} className={cn("isolate w-full gap-0 overflow-hidden py-0 shadow-none", selected && "border-ring ring-1 ring-ring")}>
    <ObjectSurface icon={icon} kind={kind} title={title} actions={actions} panels={panels} collapsed={collapsed} onExpand={expand}
      expandedHeight={expandedHeight - cardBorderBlock} resizing={resizing}
      headerClassName="card-drag-handle cursor-grab active:cursor-grabbing"
      controls={<>{controls}<IconButton size="icon-xs" label={toggleLabel} aria-expanded={!collapsed} onClick={() => onView({ collapsed: !collapsed })}>
        <motion.span className="flex" initial={false} animate={{ rotate: collapsed ? 0 : 90 }}
          transition={reducedMotion ? { duration: 0 } : fadeTransition}><ChevronRight className="size-3.5" /></motion.span>
      </IconButton></>}>
      {children}
    </ObjectSurface>
  </Card>;
});
