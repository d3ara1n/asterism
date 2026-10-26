import { RendererCardProvider, type CardPanelView, type RendererCard } from "@asterism/sdk/renderer";
import { motion } from "motion/react";
import { PanelsTopLeft, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { Button } from "@asterism/ui/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@asterism/ui/ui/dropdown-menu";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { cn } from "@asterism/ui/utils";
import { useObjectCollapse } from "./object-collapse";

const noPanels: readonly CardPanelView[] = [];

/**
 * 对象内容的公共外壳：标题栏、辅助面板容器与焦点管理。卡片与聚焦浮岛是它的两种容器，
 * 内容同一份；`@container/card` 由外壳提供，内容按所在容器宽度自适应，不感知容器种类。
 */
export function ObjectSurface({ icon, kind, title, actions, controls, panels = noPanels, collapsed = false, expandedHeight, resizing = false, onExpand, headerClassName, children }: {
  icon: ReactNode; kind: string; title: string;
  /** 资源与宿主操作，位于辅助面板菜单左侧。 */ actions?: ReactNode;
  /** 容器自身的控制（聚焦切换、折叠），位于标题栏最右侧。 */ controls?: ReactNode;
  panels?: readonly CardPanelView[];
  collapsed?: boolean;
  /** 画布提供去除外边框后的展开高度；浮岛由父容器分配高度。 */ expandedHeight?: number;
  resizing?: boolean;
  /** 折叠时选取面板需先展开。 */ onExpand?: () => void;
  headerClassName?: string; children: ReactNode;
}) {
  const i18n = useI18n();
  const collapse = useObjectCollapse(collapsed, expandedHeight, resizing);
  const [panelId, setPanelId] = useState<string | null>(null);
  const active = panels.find(panel => panel.id === panelId);
  const activeId = active?.id ?? null;
  const root = useRef<HTMLDivElement>(null);
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
    if (collapsed) onExpand?.();
  }, [panels, activeId, collapsed, onExpand]);
  const closePanel = useCallback(() => setPanelId(null), []);
  const card = useMemo<RendererCard>(() => ({ activePanel: activeId, openPanel, closePanel }), [activeId, openPanel, closePanel]);
  useEffect(() => {
    if (panelId !== null && activeId === null) setPanelId(null);
  }, [panelId, activeId]);
  useEffect(() => {
    if (!collapse.interactive) return;
    if (activeId !== null) panelElement.current?.focus({ preventScroll: true });
    else if (wasOpen.current) {
      const target = returnFocus.current?.isConnected ? returnFocus.current : trigger.current;
      target?.focus({ preventScroll: true });
    }
    wasOpen.current = activeId !== null;
  }, [activeId, collapse.interactive]);

  return <RendererCardProvider value={card}>
    <motion.div ref={root} className="@container/card min-w-0 overflow-hidden bg-muted"
      style={{ height: expandedHeight === undefined ? "100%" : collapse.height, minHeight: collapse.headerHeight ?? undefined }}
      onKeyDown={event => {
        // 菜单和对话框的 portal 不属于内容区，先由它们自行处理 Esc。
        if (event.key !== "Escape" || event.defaultPrevented || !active || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation(); closePanel();
      }}>
      <div className="flex min-h-0 min-w-0 flex-col" style={{ height: expandedHeight ?? "100%" }}>
        <header ref={collapse.header} className={cn("flex shrink-0 items-center gap-2 px-3 py-2", headerClassName)}>
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4" aria-hidden="true">{icon}</span>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <p className="type-label max-w-1/3 shrink-0 truncate" title={kind}>{kind}</p>
            <h2 className="type-section min-w-0 flex-1 truncate" title={title}>{title}</h2>
          </div>
          <div className="nodrag flex shrink-0 items-center gap-0.5">
            {actions}
            {panels.length > 0 && <DropdownMenu>
              <DropdownMenuTrigger asChild><Button ref={trigger} variant={active ? "selected" : "ghost"} size="icon-xs"
                aria-pressed={Boolean(active)} aria-label={i18n.text(objectsMessages.auxiliaryPanels)}><PanelsTopLeft /></Button></DropdownMenuTrigger>
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
            {controls}
          </div>
        </header>
        {collapse.mounted && <motion.div data-object-content="" inert={!collapse.interactive}
          style={{ opacity: collapse.opacity, y: collapse.y }}
          className="nodrag nopan relative mx-1 mb-1 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-card shadow-sm">
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
        </motion.div>}
      </div>
    </motion.div>
  </RendererCardProvider>;
}
