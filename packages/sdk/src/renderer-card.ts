import { createContext, useContext, type ComponentType, type ReactNode } from "react";
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
