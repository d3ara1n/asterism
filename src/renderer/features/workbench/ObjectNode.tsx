import { Handle, NodeResizeControl, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Grip, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { memo, useCallback, useEffect } from "react";

import { maximumCardDimension, type WorkbenchObject } from "../../../shared/workbench";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { defaultConnectionPorts, type ConnectionPort } from "./connections";
import { useWorkbench } from "./context";
import { enterFocus, exitFocus, useFocusedObject } from "./focus";
import { minimumCardHeight, minimumCardWidth } from "./layout";
import { useModuleViews } from "../../modules/views";
import { ObjectActions } from "./ObjectActions";
import { ObjectCard, type ViewPatch } from "./ObjectCard";
import { useObjectView } from "./object-view";
import { cardSize } from "./sizing";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean;
  ports?: ConnectionPort[];
  /** 工作台提供的稳定回调，按对象 ID 分派视图变更。 */
  onView: (objectId: string, patch: ViewPatch) => void;
}, "object">;

/**
 * ReactFlow 直接渲染的节点外壳：仅维护端点布局与连线锚点。
 *
 * ReactFlow 在每次拖动帧传入新的 xPos/yPos/dragging 等内部 props；外壳渲染极轻
 * （只渲染 Handle），卡片内容由 ObjectNodeContent 承担——后者只接收
 * id/data/selected，与位置 props 物理隔离，拖动期间不重渲染。
 *
 * 如需在拖动期间加视觉效果（如阴影），在此外壳读取 dragging 即可，不要把
 * 位置相关 props 传入 ObjectNodeContent，否则会恢复每帧重渲染。
 */
export const ObjectNode = memo(function ObjectNode({ id, data, selected }: NodeProps<ObjectNodeType>) {
  const ports = data.ports ?? defaultConnectionPorts;
  const updateNodeInternals = useUpdateNodeInternals();
  const portLayout = ports.map(port => `${port.id}:${port.side}:${port.offset}`).join("|");
  // 端点数量或位置变化后，使用画布自身的测量机制刷新连线锚点。
  useEffect(() => { updateNodeInternals(id); }, [id, portLayout, updateNodeInternals]);
  const registry = useModuleViews();
  const receivesLinks = registry.resource(data.object.kind).receivesLinks === true;
  return <>
    {/* Loose 模式按拖动起点确定方向；接收端由资源静态声明。 */}
    {ports.map(port => <Handle key={port.id} id={port.id} type="source"
      position={{ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[port.side]}
      style={port.side === "left" || port.side === "right" ? { top: `${port.offset * 100}%` } : { left: `${port.offset * 100}%` }}
      isConnectableEnd={receivesLinks} />)}
    <ObjectNodeContent id={id} data={data} selected={selected} />
  </>;
});

/**
 * 卡片内容：工作台拥有框架，模块按版本化投影提供内容，缺失时仍可查看原始数据。
 * 对象聚焦时内容移到聚焦浮岛，卡片保留视图操作，内容区只留提示。
 *
 * 只接收 id/data/selected，默认 memo 浅比较即可保证拖动期间不重渲染——
 * 这三个 props 都来自应用状态，不受 ReactFlow 内部位置 props 影响。
 */
const ObjectNodeContent = memo(function ObjectNodeContent({ id, data, selected }: {
  id: string; data: ObjectNodeType["data"]; selected: boolean;
}) {
  const i18n = useI18n();
  const { object, collapsed, onView } = data;
  const { session } = useWorkbench();
  const focused = useFocusedObject(session.id) === object.id;
  const content = useObjectView(object);
  const onObjectView = useCallback((patch: ViewPatch) => onView(object.id, patch), [onView, object.id]);
  const toggleFocus = () => focused ? exitFocus(session.id, object.id) : enterFocus(session.id, object.id);
  const focusLabel = i18n.text(focused ? objectsMessages.returnToCard : objectsMessages.openInIsland);
  return <>
    <ObjectCard title={object.title} collapsed={collapsed} selected={!!selected} onView={onObjectView}
      icon={content.icon} kind={content.kind}
      panels={focused ? undefined : content.panels}
      actions={<>{!focused && content.actions}<ObjectActions object={object} defaultSize={cardSize(content.view)} onView={onObjectView} /></>}
      controls={<IconButton size="icon-xs" label={focusLabel} aria-pressed={focused} data-object-focus="" onClick={toggleFocus}>
        {focused ? <PanelLeftClose /> : <PanelLeftOpen />}
      </IconButton>}>
      {focused
        ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="type-caption">{i18n.text(objectsMessages.focusedInIsland)}</p>
          <Button variant="outline" size="sm" onClick={() => exitFocus(session.id, object.id)}><PanelLeftClose />{i18n.text(objectsMessages.returnToCard)}</Button>
        </div>
        : content.body}
    </ObjectCard>
    {selected && !collapsed && <NodeResizeControl position="bottom-right"
      className="object-resize-handle nopan" minWidth={content.view.minWidth ?? minimumCardWidth}
      minHeight={content.view.minHeight ?? minimumCardHeight} maxWidth={maximumCardDimension} maxHeight={maximumCardDimension}>
      <Grip className="size-3" aria-label={i18n.formatMessage(objectsMessages.resizeCard)}><title>{i18n.formatMessage(objectsMessages.resizeCard)}</title></Grip>
    </NodeResizeControl>}
  </>;
});
