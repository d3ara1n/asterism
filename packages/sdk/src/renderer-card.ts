import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";

/** 辅助面板的身份在单个卡片 renderer 内唯一；内容接收与主体相同的已校验投影。 */
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
/** 卡片局部视图操作，不提交资源命令或写入任务历史。 */
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
