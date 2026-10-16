import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pluginOf } from "@atelier/sdk/contracts";
import { RendererPreferencesProvider, useI18n } from "@atelier/sdk/renderer";
import { agentUI, AgentUIRendererProvider, type AgentUIContribution, type AgentOverlayPosition, type AgentOverlayProps, type AgentModalProps } from "@atelier/builtin-api/renderer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@atelier/ui/ui/dialog";
import { useBuiltinRendererServices } from "../../renderer-context";
import { createComposerVisibility } from "./composer-visibility";

interface CardUI {
  targets: Record<AgentOverlayPosition, HTMLDivElement | null>;
  refs: Record<"top" | "bottom", (element: HTMLDivElement | null) => void>;
  composer: ReturnType<typeof createComposerVisibility>;
}
const Context = createContext<CardUI | null>(null);
const ContributionOrder = createContext(0);
const renderer = { Overlay, Modal };
function useCardUI() {
  const context = useContext(Context);
  if (!context) throw new Error("Agent UI requires its card layout.");
  return context;
}

/** 为每张卡片保留独立目标和输入区约束；portal 保留贡献者的 React context。 */
export function AgentUI({ children }: { children: ReactNode }) {
  const [top, setTop] = useState<HTMLDivElement | null>(null);
  const [center, setCenter] = useState<HTMLDivElement | null>(null);
  const [bottom, setBottom] = useState<HTMLDivElement | null>(null);
  const [composer] = useState(createComposerVisibility);
  const value = useMemo<CardUI>(() => ({
    targets: { top, center, bottom },
    refs: { top: setTop, bottom: setBottom },
    composer,
  }), [top, center, bottom, composer]);
  return <Context.Provider value={value}><AgentUIRendererProvider value={renderer}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      {children}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div ref={setCenter} className="flex max-h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 empty:hidden" />
      </div>
    </div>
    <Contributions />
  </AgentUIRendererProvider></Context.Provider>;
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
  const { targets } = useCardUI();
  const order = useContext(ContributionOrder);
  const [container] = useState(() => document.createElement("div"));
  useHideComposer(hideComposer);
  const target = targets[position];
  // portal 的目标保持稳定，位置变化只移动容器，保留表单状态和订阅。
  useLayoutEffect(() => {
    if (!target) { container.remove(); return; }
    const focus = document.activeElement;
    target.appendChild(container);
    if (focus instanceof HTMLElement && container.contains(focus)) focus.focus({ preventScroll: true });
  }, [container, target]);
  useLayoutEffect(() => { container.style.order = String(order); }, [container, order]);
  useLayoutEffect(() => () => { container.remove(); }, [container]);
  return target ? createPortal(<div className="surface-floating nokey pointer-events-auto min-h-0 overflow-auto p-3">{children}</div>, container) : null;
}
function Modal({ open, onOpenChange, title, description, hideComposer = false, children }: AgentModalProps) {
  const i18n = useI18n();
  const descriptionId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);
  useHideComposer(open && hideComposer);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="nodrag nopan nokey max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
