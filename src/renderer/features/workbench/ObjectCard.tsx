import { RendererCardProvider, type CardPanelView, type RendererCard } from "@atelier/sdk/renderer";
import { ChevronRight, ChevronDown, PanelsTopLeft, X } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { commonMessages } from "../../messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Card } from "../../shared/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "../../shared/ui/dropdown-menu";
import { IconButton } from "../../shared/ui/icon-button";
import { cn } from "../../shared/utils";
import type { CardSize } from "../../../shared/workbench";

/** 卡片拖动柄选择器；画布只认它，卡片内容不感知拖动。 */
export const cardDragHandle = ".card-drag-handle";
export type ViewPatch = { hidden?: boolean; collapsed?: boolean; size?: CardSize | null };
const noPanels: readonly CardPanelView[] = [];

/** 卡片拥有辅助面板的容器与局部状态；主体位置固定，面板开关不重挂载主体。 */
export const ObjectCard = memo(function ObjectCard({ icon, kind, title, actions, panels = noPanels, collapsed, selected, onView, children }: {
  icon: ReactNode; kind: string; title: string; actions?: ReactNode; panels?: readonly CardPanelView[];
  collapsed: boolean; selected: boolean;
  onView: (patch: ViewPatch) => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const [panelId, setPanelId] = useState<string | null>(null);
  const active = panels.find(panel => panel.id === panelId);
  const activeId = active?.id ?? null;
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelElement = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const menuSelected = useRef(false);
  const wasOpen = useRef(false);
  const headingId = useId();
  const openPanel = useCallback((id: string) => {
    if (!panels.some(panel => panel.id === id)) throw new Error(`Unknown card panel: ${id}`);
    if (!activeId) {
      const focused = document.activeElement;
      returnFocus.current = focused instanceof HTMLElement && root.current?.contains(focused) ? focused : trigger.current;
    }
    setPanelId(id);
    if (collapsed) onView({ collapsed: false });
  }, [panels, activeId, collapsed, onView]);
  const closePanel = useCallback(() => setPanelId(null), []);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    // React Flow 在原生冒泡阶段处理 wheel；React onWheel 执行时已晚于画布。
    const onWheel = (event: WheelEvent) => {
      const zoom = event.ctrlKey || (window.host.platform === "darwin" && event.metaKey);
      // 普通滚动保留浏览器默认行为；已被内部组件消费的事件不再交给画布。
      if (!zoom || event.defaultPrevented) event.stopPropagation();
    };
    element.addEventListener("wheel", onWheel, { passive: true });
    return () => element.removeEventListener("wheel", onWheel);
  }, [collapsed]);
  const card = useMemo<RendererCard>(() => ({ activePanel: activeId, openPanel, closePanel }), [activeId, openPanel, closePanel]);
  useEffect(() => {
    if (panelId !== null && activeId === null) setPanelId(null);
  }, [panelId, activeId]);
  useEffect(() => {
    if (collapsed) return;
    if (activeId !== null) panelElement.current?.focus({ preventScroll: true });
    else if (wasOpen.current) {
      const target = returnFocus.current?.isConnected ? returnFocus.current : trigger.current;
      target?.focus({ preventScroll: true });
    }
    wasOpen.current = activeId !== null;
  }, [activeId, collapsed]);

  const toggleLabel = collapsed ? i18n.text(commonMessages.expand) : i18n.text(commonMessages.collapse);
  return <RendererCardProvider value={card}>
    <Card ref={root} className={cn("@container/card isolate w-full gap-0 overflow-hidden py-0", !collapsed && "h-full", selected && "border-ring")}
      onKeyDown={event => {
        // 菜单和对话框的 portal 不属于卡片内容区，先由它们自行处理 Esc。
        if (event.key !== "Escape" || event.defaultPrevented || !active || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation(); closePanel();
      }}>
      <header className="card-drag-handle flex shrink-0 cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
        <span className="text-muted-foreground" aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="type-label truncate">{kind}</p>
          <h2 className="type-section mt-0.5 truncate">{title}</h2>
        </div>
        <div className="nodrag flex shrink-0 items-center gap-0.5">
          {actions}
          {panels.length > 0 && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button ref={trigger} variant={active ? "secondary" : "ghost"} size="icon-xs"
              aria-label={i18n.text(objectsMessages.auxiliaryPanels)}><PanelsTopLeft /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={event => {
              if (!menuSelected.current) return;
              menuSelected.current = false;
              event.preventDefault();
              panelElement.current?.focus({ preventScroll: true });
            }}>
              <DropdownMenuRadioGroup value={activeId ?? ""} onValueChange={id => { menuSelected.current = true; openPanel(id); }}>
                {panels.map(panel => <DropdownMenuRadioItem key={panel.id} value={panel.id}>
                  {panel.icon}{i18n.text(panel.label)}
                </DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>}
          <IconButton size="icon-xs" label={toggleLabel} aria-expanded={!collapsed} onClick={() => onView({ collapsed: !collapsed })}>
            {collapsed ? <ChevronRight /> : <ChevronDown />}
          </IconButton>
          <IconButton size="icon-xs" label={i18n.text(commonMessages.closeView)} onClick={() => onView({ hidden: true })}><X /></IconButton>
        </div>
      </header>
      {!collapsed && <div ref={content} className="nodrag nopan relative flex min-h-0 min-w-0 flex-1 overflow-hidden border-t">
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", active && "invisible @min-[52rem]/card:visible")}>{children}</div>
        {active && <aside ref={panelElement} tabIndex={-1} aria-labelledby={headingId}
          className="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-card outline-none @min-[52rem]/card:static @min-[52rem]/card:w-80 @min-[52rem]/card:shrink-0 @min-[52rem]/card:border-l">
          <header className="flex shrink-0 items-center gap-2 border-b p-3">
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4" aria-hidden="true">{active.icon}</span>
            <h3 id={headingId} className="type-section min-w-0 flex-1 truncate">{i18n.text(active.label)}</h3>
            <IconButton size="icon-xs" label={i18n.text(objectsMessages.closeAuxiliaryPanel)} onClick={closePanel}><X /></IconButton>
          </header>
          <div key={active.id} className="flex min-h-0 flex-1 flex-col overflow-auto">{active.body}</div>
        </aside>}
      </div>}
    </Card>
  </RendererCardProvider>;
});
