import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkbenchObject } from "../../../shared/contracts";
import { Bot, FileText, Maximize2, Minus, X } from "lucide-react";
import { Button } from "../../shared/ui/button";
import { Card } from "../../shared/ui/card";
import { t } from "../../shared/i18n";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean; historical: boolean; bindingCount: number;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed } = data;
  return <Card className={`w-[340px] gap-0 overflow-hidden py-0 ${selected ? "border-ring" : ""}`}>
    <Handle type={object.kind === "agent" ? "target" : "source"} position={object.kind === "agent" ? Position.Left : Position.Right} isConnectable={false} />
    <header className="card-drag-handle flex cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
      <span className="text-muted-foreground" aria-hidden="true">{object.kind === "agent" ? <Bot className="size-4" /> : <FileText className="size-4" />}</span>
      <div className="min-w-0 flex-1">
        <p className="type-label">{object.kind === "agent" ? t.kindAgent : t.kindNote}</p>
        <h2 className="type-section mt-0.5 truncate">{object.title}</h2>
      </div>
      <div className="nodrag flex">
        <Button variant="ghost" size="icon-xs" aria-label={collapsed ? t.expand : t.collapse} title={collapsed ? t.expand : t.collapse} disabled={data.historical} onClick={() => data.onView({ collapsed: !collapsed })}>{collapsed ? <Maximize2 /> : <Minus />}</Button>
        <Button variant="ghost" size="icon-xs" aria-label={t.closeView} title={t.closeView} disabled={data.historical} onClick={() => data.onView({ hidden: true })}><X /></Button>
      </div>
    </header>
    {!collapsed && <div className="nodrag nowheel border-t p-3">
      {object.kind === "agent" ? <>
        <p className="type-body font-medium">{t.noModel}</p>
        <p className="type-caption mt-1">{t.noModelBody}</p>
        <p className="mt-3 text-xs text-primary">{t.bindings(data.bindingCount)}</p>
      </> : object.content_available ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{object.content}</pre> : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
    </div>}
  </Card>;
}
