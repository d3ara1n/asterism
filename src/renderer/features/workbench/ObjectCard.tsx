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

/** Card drag handle selector; the canvas recognizes only this, and card content is unaware of dragging. */
export const cardDragHandle = ".card-drag-handle";
export type ViewPatch = { collapsed?: boolean; size?: CardSize | null };
/** Card has a 1px border at both top and bottom; shell height is calculated from the dimensions inside the borders. */
const cardBorderBlock = 2;

/** Object container on the canvas: adds a drag handle, collapsing, and canvas wheel ownership around the shared shell. */
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
    // React Flow handles wheel during native bubbling; React onWheel runs after the canvas. Intercept wheel events only in the content area.
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-object-content]")) return;
      const zoom = event.ctrlKey || (window.host.platform === "darwin" && event.metaKey);
      // Preserve the browser's default behavior for ordinary scrolling; events already consumed by internal components are not passed to the canvas.
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
