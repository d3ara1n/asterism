import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pluginOf } from "@asterism-app/sdk/contracts";
import { RendererPreferencesProvider, useI18n, useRendererCatalogs } from "@asterism-app/sdk/renderer";
import { ModelConfiguration, resolveAgentModelSelection, type AgentSelection } from "@asterism-app/builtin-api/contracts";
import { agentUI, AgentUIRendererProvider, AgentModelSelectionProvider, type AgentModelSelection, type AgentToolbarItemProps, type AgentUIContribution, type AgentOverlayPosition, type AgentOverlayProps, type AgentModalProps } from "@asterism-app/builtin-api/renderer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { useBuiltinRendererServices } from "../../renderer-context";
import { createComposerVisibility } from "./composer-visibility";
import { ScrollArea } from "./ScrollArea";

type RegionPosition = AgentOverlayPosition | "toolbar";
interface CardUI {
  targets: Record<RegionPosition, HTMLDivElement | null>;
  refs: Record<"top" | "bottom" | "toolbar", (element: HTMLDivElement | null) => void>;
  composer: ReturnType<typeof createComposerVisibility>;
}
const Context = createContext<CardUI | null>(null);
const ContributionOrder = createContext(0);
const renderer = { ToolbarItem, Overlay, Modal, ScrollArea };
function useCardUI() {
  const context = useContext(Context);
  if (!context) throw new Error("Agent UI requires its card layout.");
  return context;
}

/** Retains independent targets and input-area constraints for each card; portals preserve contributors' React context. */
export function AgentUI({ selection, children }: { selection: AgentSelection | null; children: ReactNode }) {
  const [top, setTop] = useState<HTMLDivElement | null>(null);
  const [center, setCenter] = useState<HTMLDivElement | null>(null);
  const [bottom, setBottom] = useState<HTMLDivElement | null>(null);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [composer] = useState(createComposerVisibility);
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const modelSelection = useMemo<AgentModelSelection>(() => ({
    selection,
    ...(selection && configuration ? resolveAgentModelSelection(configuration, selection)
      : { reference: null, model: null, thinking: null }),
  }), [selection, configuration]);
  const value = useMemo<CardUI>(() => ({
    targets: { top, center, bottom, toolbar },
    refs: { top: setTop, bottom: setBottom, toolbar: setToolbar },
    composer,
  }), [top, center, bottom, toolbar, composer]);
  return <Context.Provider value={value}><AgentUIRendererProvider value={renderer}><AgentModelSelectionProvider value={modelSelection}>
    <div className="relative flex min-h-0 flex-1 flex-col [container-type:size]">
      {children}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div ref={setCenter} className="flex max-h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 empty:hidden" />
      </div>
    </div>
    <Contributions />
  </AgentModelSelectionProvider></AgentUIRendererProvider></Context.Provider>;
}

export function AgentToolbar() {
  const { refs } = useCardUI();
  return <div ref={refs.toolbar} className="flex min-w-0 flex-wrap items-center gap-0.5 empty:hidden" />;
}

export function AgentUIRegion({ position }: { position: "top" | "bottom" }) {
  const { refs } = useCardUI();
  return <div ref={refs[position]} className="relative z-10 flex min-h-0 shrink-0 flex-col gap-3 p-3 empty:hidden" />;
}

function Contributions() {
  const entries = useSyncExternalStore(agentUI.subscribe, agentUI.getSnapshot);
  return entries.map((entry, order) => <Contribution key={entry.id} entry={entry} order={order} />);
}
function Contribution({ entry, order }: { entry: AgentUIContribution; order: number }) {
  const services = useBuiltinRendererServices();
  const preferences = useMemo(() => services.preferences(pluginOf(entry.id)!), [services, entry.id]);
  return <ContributionOrder.Provider value={order}>
    <RendererPreferencesProvider value={preferences}><entry.Component /></RendererPreferencesProvider>
  </ContributionOrder.Provider>;
}

export function useComposerHidden(): boolean {
  const { composer } = useCardUI();
  return useSyncExternalStore(composer.subscribe, composer.getSnapshot);
}
function useHideComposer(hidden: boolean) {
  const { composer } = useCardUI();
  useLayoutEffect(() => hidden ? composer.hide() : undefined, [composer, hidden]);
}
function Overlay({ position, hideComposer = false, children }: AgentOverlayProps) {
  useHideComposer(hideComposer);
  // The shell does not clip; AgentScrollArea consistently provides local scrolling viewports and focus-ring clearance.
  return <ContributionPortal position={position}>
    <div className="surface-floating nokey pointer-events-auto min-h-0 p-3">{children}</div>
  </ContributionPortal>;
}
function ToolbarItem({ children }: AgentToolbarItemProps) {
  return <ContributionPortal position="toolbar" className="nodrag nopan nokey flex min-w-0 max-w-full items-center">
    {children}
  </ContributionPortal>;
}
function ContributionPortal({ position, className = "", children }: {
  position: RegionPosition; className?: string; children: ReactNode;
}) {
  const { targets } = useCardUI();
  const order = useContext(ContributionOrder);
  const [container] = useState(() => document.createElement("div"));
  const target = targets[position];
  // Portal targets stay stable; position changes move only containers, preserving form state and subscriptions.
  useLayoutEffect(() => {
    if (!target) { container.remove(); return; }
    const focus = document.activeElement;
    container.style.order = String(order);
    // DOM order matches visual order; contributions shown later still participate in keyboard navigation in registration order.
    const next = Array.from(target.children).find(child => child instanceof HTMLElement && Number(child.style.order) > order);
    target.insertBefore(container, next ?? null);
    if (focus instanceof HTMLElement && container.contains(focus)) focus.focus({ preventScroll: true });
  }, [container, target, order]);
  useLayoutEffect(() => { container.className = className; }, [container, className]);
  useLayoutEffect(() => () => { container.remove(); }, [container]);
  return target ? createPortal(children, container) : null;
}
function Modal({ open, onOpenChange, title, description, size = "default", hideComposer = false, children }: AgentModalProps) {
  const i18n = useI18n();
  const descriptionId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);
  useHideComposer(open && hideComposer);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`nodrag nopan nokey max-h-[calc(100dvh-2rem)] overflow-y-auto ${size === "wide" ? "sm:max-w-4xl" : ""}`}
      showCloseButton={!!onOpenChange} aria-describedby={description ? descriptionId : undefined}
      onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
      }}>
      <DialogHeader><DialogTitle>{i18n.text(title)}</DialogTitle>
        {description && <DialogDescription id={descriptionId}>{i18n.text(description)}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>;
}
