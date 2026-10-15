import { Handle, NodeResizeControl, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Grip } from "lucide-react";
import { memo, useCallback, useEffect } from "react";

import { maximumCardDimension, type WorkbenchObject } from "../../../shared/workbench";
import { objectsMessages } from "../../messages/objects";
import { ObjectServices, useObjectContext } from "../../modules/object-context";
import { SlotBoundary } from "../../modules/SlotBoundary";
import { JsonView, useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";
import { defaultConnectionPorts, type ConnectionPort } from "./connections";
import { minimumCardHeight, minimumCardWidth } from "./layout";
import { ObjectActions } from "./ObjectActions";
import { ObjectCard, type ViewPatch } from "./ObjectCard";
import { cardSize, fallbackCardAppearance } from "./sizing";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean;
  ports?: ConnectionPort[];
  /** 工作台提供的稳定回调，按对象 ID 分派视图变更。 */
  onView: (objectId: string, patch: ViewPatch) => void;
}, "object">;

/** 工作台拥有卡片框架；模块按版本化投影提供内容，缺失时仍可查看原始数据。 */
export const ObjectNode = memo(function ObjectNode({ id, data, selected }: NodeProps<ObjectNodeType>) {
  const i18n = useI18n();
  const { object, collapsed, onView } = data;
  const ports = data.ports ?? defaultConnectionPorts;
  const updateNodeInternals = useUpdateNodeInternals();
  const portLayout = ports.map(port => `${port.id}:${port.side}:${port.offset}`).join("|");
  // 端点数量或位置变化后，使用画布自身的测量机制刷新连线锚点。
  useEffect(() => { updateNodeInternals(id); }, [id, portLayout, updateNodeInternals]);
  const registry = useModuleViews();
  const descriptor = registry.resource(object.kind);
  const context = useObjectContext(object);
  const view = registry.card(object.presentation, context) ?? {
    ...fallbackCardAppearance,
    body: <div className="min-h-0 flex-1 select-text overflow-auto p-3"><JsonView value={object.presentation.data} /></div>,
    actions: undefined,
    panels: undefined,
  };
  const onObjectView = useCallback((patch: ViewPatch) => onView(object.id, patch), [onView, object.id]);
  return <>
    {/* Loose 模式按拖动起点确定方向；接收端由资源静态声明。 */}
    {ports.map(port => <Handle key={port.id} id={port.id} type="source"
      position={{ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[port.side]}
      style={port.side === "left" || port.side === "right" ? { top: `${port.offset * 100}%` } : { left: `${port.offset * 100}%` }}
      isConnectableEnd={descriptor.receivesLinks === true} />)}
    <ObjectCard title={object.title} collapsed={collapsed} selected={!!selected} onView={onObjectView}
      icon={descriptor.icon} kind={i18n.text(descriptor.label)}
      panels={view.panels?.map(panel => ({ ...panel,
        body: <SlotBoundary><ObjectServices object={object}>{panel.body}</ObjectServices></SlotBoundary>,
      }))}
      actions={<><SlotBoundary fallback={null}><ObjectServices object={object}>{view.actions}</ObjectServices></SlotBoundary><ObjectActions object={object} defaultSize={cardSize(view)} onView={onObjectView} /></>}>
      <SlotBoundary key={JSON.stringify(object.presentation.contract)}><ObjectServices object={object}>{view.body}</ObjectServices></SlotBoundary>
    </ObjectCard>
    {selected && !collapsed && <NodeResizeControl position="bottom-right"
      className="object-resize-handle nopan" minWidth={view.minWidth ?? minimumCardWidth}
      minHeight={view.minHeight ?? minimumCardHeight} maxWidth={maximumCardDimension} maxHeight={maximumCardDimension}>
      <Grip className="size-3" aria-label={i18n.formatMessage(objectsMessages.resizeCard)}><title>{i18n.formatMessage(objectsMessages.resizeCard)}</title></Grip>
    </NodeResizeControl>}
  </>;
});
