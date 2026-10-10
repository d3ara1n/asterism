import type { CardSize, WorkbenchSnapshot } from "../../../shared/workbench";
import type { ViewRegistry } from "../../modules/registry";
import { cardDragHandle, type ViewPatch } from "./ObjectCard";
import type { ObjectNodeType } from "./ObjectNode";
import { defaultCardPosition } from "./layout";
import { cardSize, fallbackCardAppearance } from "./sizing";

/** 后台投影更新内容；在途拖动和未确认的尺寸覆盖继续由本地意图拥有。 */
export function workbenchNodes(
  snapshot: WorkbenchSnapshot, previous: readonly ObjectNodeType[], registry: ViewRegistry,
  onView: (objectId: string, patch: ViewPatch) => void,
  pendingSizes: ReadonlyMap<string, { size: CardSize | null }>,
): ObjectNodeType[] {
  return snapshot.objects.flatMap(object => {
    const view = snapshot.views.find(v => v.objectId === object.id)
      ?? { position: defaultCardPosition, hidden: false, collapsed: false, size: null };
    if (view.hidden) return [];
    const current = previous.find(node => node.id === object.id);
    const pending = pendingSizes.get(object.id);
    const appearance = registry.card(object.presentation) ?? fallbackCardAppearance;
    const size = cardSize(appearance, pending ? pending.size : view.size);
    const data = current && current.data.object === object && current.data.collapsed === view.collapsed
      ? current.data : { object, collapsed: view.collapsed, onView };
    const resizing = !!current?.resizing && !view.collapsed;
    const node: ObjectNodeType = {
      id: object.id, type: "object", position: current?.dragging ? current.position : view.position,
      dragHandle: cardDragHandle, deletable: false, data,
      width: resizing ? current.width : size.width,
      height: view.collapsed ? undefined : resizing ? current.height : size.height,
      measured: current?.measured, selected: current?.selected,
      dragging: current?.dragging, resizing,
    };
    return [node];
  });
}
