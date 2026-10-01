import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkbenchObject } from "../../../shared/contracts";
import { Button } from "../../shared/ui/button";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean; historical: boolean; bindingCount: number;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed } = data;
  return <article className={`object-card ${selected ? "object-card-selected" : ""}`}>
    <Handle type={object.kind === "agent" ? "target" : "source"} position={object.kind === "agent" ? Position.Left : Position.Right} isConnectable={false} />
    <header className="card-drag-handle flex cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
      <span className={`object-symbol ${object.kind === "agent" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`} aria-hidden="true">{object.kind === "agent" ? "◈" : "▤"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{object.kind === "agent" ? "Agent · 代理" : "Note · 笔记"}</p>
        <h2 className="mt-1 truncate text-sm font-semibold">{object.title}</h2>
      </div>
      <div className="nodrag flex">
        <Button size="icon" variant="ghost" disabled={data.historical} onClick={() => data.onView({ collapsed: !collapsed })} aria-label={collapsed ? "Expand · 展开" : "Collapse · 折叠"}>{collapsed ? "+" : "−"}</Button>
        <Button size="icon" variant="ghost" disabled={data.historical} onClick={() => data.onView({ hidden: true })} aria-label="Close view · 关闭视图">×</Button>
      </div>
    </header>
    {!collapsed && <div className="nodrag nowheel border-t border-border/60 p-3">
      {object.kind === "agent" ? <>
        <p className="text-sm">No model connected <span className="block mt-1 text-xs text-muted-foreground">尚未接入模型</span></p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This agent is saved. Execution will be available when a model provider is connected.</p>
        <p className="mt-3 text-xs text-primary">{data.bindingCount} resource bindings · 资源绑定</p>
      </> : object.content_available ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{object.content}</pre> : <p className="text-sm text-muted-foreground">Saved content is unavailable. · 已保存内容不可用。</p>}
    </div>}
  </article>;
}
