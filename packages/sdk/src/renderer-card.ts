import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";

/** Auxiliary panel identities are unique within a single card renderer; content receives the same validated projection as the body. */
export interface CardPanelDefinition<T> {
  id: string;
  label: UiText;
  icon: ReactNode;
  Body: ComponentType<{ data: T }>;
}
export interface CardPanelView {
  id: string;
  label: UiText;
  icon: ReactNode;
  body: ReactNode;
}
/** Local card view operations; do not submit resource commands or write task history. */
export interface RendererCard {
  readonly activePanel: string | null;
  openPanel(id: string): void;
  closePanel(): void;
}
const CardContext = createContext<RendererCard | null>(null);
export const RendererCardProvider = CardContext.Provider;
export function useRendererCard(): RendererCard {
  const card = useContext(CardContext);
  if (!card) throw new Error("The renderer must be bound to a card.");
  return card;
}

export type CardStatusTone = "success" | "warning" | "error" | "progress" | "neutral";

/**
 * Title bar content for the card or island that shows an object. Everything is optional; omitted parts leave the host's
 * kind icon and object title. Width runs out in a fixed order: a page's muted object-title prefix hides first, then the
 * summary, then the status label, leaving its icon; the title truncates last.
 */
export interface CardHeaderProps {
  /** Localized passive fact after the title, such as a count or the current scope. Non-interactive phrasing content, rendered by the host outside the contributor's component tree. */
  summary?: ReactNode;
  /** A state the reader should notice, after the title. Its label yields to the title and leaves the tone's icon, whose tooltip and accessible text keep the label. */
  status?: { tone: CardStatusTone; label: string; /** Progress animates unless still; still describes a stored fact rather than live work. */ still?: boolean };
  /**
   * A page inside the object, such as an item's details. Its title replaces the object title, which becomes a muted
   * prefix, and a back control replaces the kind icon. autoFocus moves focus to the back control when the page opens.
   */
  page?: { title: string; backLabel: string; onBack(): void; autoFocus?: boolean };
  /** Controls at the end of the title bar, before the host's own controls. They keep the context of the component that renders them. */
  actions?: ReactNode;
}

const CardHeaderContext = createContext<ComponentType<CardHeaderProps> | null>(null);
/** Host binding for the card title bar. */
export const RendererCardHeaderProvider = CardHeaderContext.Provider;

/**
 * Contribute the title bar. Render it from the card's `Header` component, which stays mounted while the card is collapsed,
 * or from the body. The most recently mounted body contribution replaces the `Header` contribution as a whole while it
 * stays mounted, so a drill-down page states its complete header. Rendering it nowhere else has no effect.
 */
export function CardHeader(props: CardHeaderProps) {
  const Header = useContext(CardHeaderContext);
  if (!Header) throw new Error("Card headers must be provided by the host.");
  return createElement(Header, props);
}
