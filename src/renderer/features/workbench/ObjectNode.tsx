import { memo, useCallback, useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import type { WorkbenchObject } from "../../../shared/workbench";
import { JsonView, useModuleViews } from "../../modules/views";
import { ObjectCard, type ViewPatch } from "./ObjectCard";
import { fallbackCardWidth } from "./layout";
import { defaultConnectionPorts, type ConnectionPort } from "./connections";
import { ObjectActions } from "./ObjectActions";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean;
  ports?: ConnectionPort[];
  /** 工作台提供的稳定回调，按对象 ID 分派视图变更。 */
  onView: (objectId: string, patch: ViewPatch) => void;
}, "object">;

/** 工作台拥有卡片框架；模块按版本化投影提供内容，缺失时仍可查看原始数据。 */
export const ObjectNode = memo(function ObjectNode({ id, data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed, onView } = data;
  const ports = data.ports ?? defaultConnectionPorts;
  const updateNodeInternals = useUpdateNodeInternals();
  const portLayout = ports.map(port => `${port.id}:${port.side}:${port.offset}`).join("|");
  // 端点数量或位置变化后，使用画布自身的测量机制刷新连线锚点。
  useEffect(() => { updateNodeInternals(id); }, [id, portLayout, updateNodeInternals]);
  const registry = useModuleViews();
  const descriptor = registry.resource(object.kind);
  const view = useMemo(() => registry.card(object.presentation) ?? {
    width: fallbackCardWidth,
    body: <div className="select-text p-3"><JsonView value={object.presentation.data} /></div>,
    actions: undefined, height: undefined,
  }, [registry, object]);
  const onObjectView = useCallback((patch: ViewPatch) => onView(object.id, patch), [onView, object.id]);
  return <>
    {/* Loose 模式按拖动起点确定方向；四边端点均可发出，只有代理可接收。 */}
    {ports.map(port => <Handle key={port.id} id={port.id} type="source"
      position={{ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[port.side]}
      style={port.side === "left" || port.side === "right" ? { top: `${port.offset * 100}%` } : { left: `${port.offset * 100}%` }}
      isConnectableEnd={object.kind === "agent"} />)}
    <ObjectCard title={object.title} collapsed={collapsed} selected={!!selected} onView={onObjectView}
      icon={descriptor.icon} kind={descriptor.label} width={view.width} height={view.height}
      actions={<>{view.actions}<ObjectActions object={object} /></>}>
      {view.body}
    </ObjectCard>
  </>;
});
