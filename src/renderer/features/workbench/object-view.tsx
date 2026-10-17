import type { CardPanelView } from "@atelier/sdk/renderer";
import type { ReactNode } from "react";

import type { WorkbenchObject } from "../../../shared/workbench";
import { ObjectServices, useObjectContext } from "../../modules/object-context";
import { SlotBoundary } from "../../modules/SlotBoundary";
import { JsonView, useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";
import { fallbackCardAppearance } from "./sizing";

/**
 * 解析对象内容的视图：主体、辅助面板与资源操作均已绑定对象能力并隔离异常。
 * 卡片与聚焦浮岛共用这一份解析，内容在哪个容器里挂载由调用方决定。
 */
export function useObjectView(object: WorkbenchObject) {
  const i18n = useI18n();
  const registry = useModuleViews();
  const descriptor = registry.resource(object.kind);
  const context = useObjectContext(object);
  const view = registry.card(object.presentation, context) ?? {
    ...fallbackCardAppearance,
    body: <div className="min-h-0 flex-1 select-text overflow-auto p-3"><JsonView value={object.presentation.data} /></div>,
    actions: undefined,
    panels: undefined,
  };
  const bind = (node: ReactNode) => <ObjectServices object={object}>{node}</ObjectServices>;
  const panels: CardPanelView[] | undefined = view.panels?.map(panel => ({ ...panel, body: <SlotBoundary>{bind(panel.body)}</SlotBoundary> }));
  return {
    descriptor, view,
    icon: descriptor.icon,
    kind: i18n.text(descriptor.label),
    body: <SlotBoundary key={JSON.stringify(object.presentation.contract)}>{bind(view.body)}</SlotBoundary>,
    panels,
    actions: <SlotBoundary fallback={null}>{bind(view.actions)}</SlotBoundary>,
  };
}
