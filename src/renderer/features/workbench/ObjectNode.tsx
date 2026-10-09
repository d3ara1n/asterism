import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileQuestion } from "lucide-react";
import type { WorkbenchObject } from "../../../shared/workbench";
import { JsonView, useModuleViews } from "../../modules/views";
import { ObjectCard } from "./ObjectCard";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

/** 工作台拥有卡片框架；模块按版本化投影提供内容，缺失时仍可查看原始数据。 */
export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed, onView } = data;
  const registry = useModuleViews();
  const view = registry.card(object.presentation) ?? {
    label: object.kind, icon: <FileQuestion className="size-4" />, width: 340, connection: "source" as const,
    body: <div className="select-text p-3"><JsonView value={object.presentation.data} /></div>, actions: undefined, height: undefined,
  };
  return <>
    <Handle type={view.connection} position={view.connection === "target" ? Position.Left : Position.Right} isConnectable={false} />
    <ObjectCard title={object.title} collapsed={collapsed} selected={!!selected} onView={onView}
      icon={view.icon} kind={view.label} width={view.width} height={view.height} actions={view.actions}>
      {view.body}
    </ObjectCard>
  </>;
}
