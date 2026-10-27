import { RendererCardProvider, type CardPanelView, type RendererCard } from "@asterism-app/sdk/renderer";
import { motion } from "motion/react";
import { PanelsTopLeft, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { Button } from "@asterism-app/ui/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@asterism-app/ui/ui/dropdown-menu";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { cn } from "@asterism-app/ui/utils";
import { useObjectCollapse } from "./object-collapse";

const noPanels: readonly CardPanelView[] = [];

/**
 * Shared shell for object content: titlebar, auxiliary panel container, and focus management. Cards and focus islands are its two container types,
 * sharing the same content; the shell provides `@container/card`, and content adapts to its container width without knowing the container type.
 */
export function ObjectSurface({ icon, kind, title, actions, controls, panels = noPanels, collapsed = false, expandedHeight, resizing = false, onExpand, headerClassName, children }: {
  icon: ReactNode; kind: string; title: string;
  /** Resource and host actions, to the left of the auxiliary panel menu. */ actions?: ReactNode;
  /** Container controls (focus toggle and collapse), at the far right of the titlebar. */ controls?: ReactNode;
  panels?: readonly CardPanelView[];
  collapsed?: boolean;
  /** The canvas provides expanded height excluding the outer border; an island receives its height from its parent container. */ expandedHeight?: number;
  resizing?: boolean;
  /** Selecting a panel while collapsed requires expanding first. */ onExpand?: () => void;
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
    <motion.div ref={root} className="@container/card min-w-0 overflow-hidden bg-card-shell"
      style={{ height: expandedHeight === undefined ? "100%" : collapse.height, minHeight: collapse.headerHeight ?? undefined }}
      onKeyDown={event => {
        // Menu and dialog portals are outside the content area; let them handle Esc first.
        if (event.key !== "Escape" || event.defaultPrevented || !active || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation(); closePanel();
      }}>
      <div className="flex min-h-0 min-w-0 flex-col" style={{ height: expandedHeight ?? "100%" }}>
        <header ref={collapse.header} className={cn("flex shrink-0 items-center gap-2 px-3 py-2", headerClassName)}>
          {/* Narrow containers show only the type icon, leaving width for the title; the type name always remains the icon's accessible name and tooltip. */}
          <span role="img" aria-label={kind} title={kind} className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <p aria-hidden="true" className="type-label hidden max-w-1/3 shrink-0 truncate @min-[24rem]/card:block">{kind}</p>
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
          // Distinguish content surface and shell by background color alone, without a border; soft, faint shadows around the edges transition colors without a hard dividing line.
          className="nodrag nopan relative mx-1 mb-1 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_0_2px_0_rgb(0_0_0/0.04)]">
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
