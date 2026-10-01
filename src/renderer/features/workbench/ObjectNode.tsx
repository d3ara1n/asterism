import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkbenchObject } from "../../../shared/contracts";
import { Bot, FileText, Maximize2, Minus, X } from "lucide-react";
import { IconButton } from "../../shared/ui/button";
import { t } from "../../shared/i18n";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean; historical: boolean; bindingCount: number;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed } = data;
  return <article className={`object-card ${selected ? "object-card-selected" : ""}`}>
    <Handle type={object.kind === "agent" ? "target" : "source"} position={object.kind === "agent" ? Position.Left : Position.Right} isConnectable={false} />
    <header className="card-drag-handle flex cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
      <span className={`object-symbol ${object.kind === "agent" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`} aria-hidden="true">{object.kind === "agent" ? <Bot className="size-4" /> : <FileText className="size-4" />}</span>
      <div className="min-w-0 flex-1">
        <p className="type-label">{object.kind === "agent" ? t.kindAgent : t.kindNote}</p>
        <h2 className="type-section mt-0.5 truncate">{object.title}</h2>
      </div>
      <div className="nodrag flex">
        <IconButton label={collapsed ? t.expand : t.collapse} disabled={data.historical} onClick={() => data.onView({ collapsed: !collapsed })}>{collapsed ? <Maximize2 /> : <Minus />}</IconButton>
        <IconButton label={t.closeView} disabled={data.historical} onClick={() => data.onView({ hidden: true })}><X /></IconButton>
      </div>
    </header>
    {!collapsed && <div className="nodrag nowheel border-t border-border/60 p-3">
      {object.kind === "agent" ? <>
        <p className="type-body font-medium">{t.noModel}</p>
        <p className="type-caption mt-1">{t.noModelBody}</p>
        <p className="mt-3 text-xs text-primary">{t.bindings(data.bindingCount)}</p>
      </> : object.content_available ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{object.content}</pre> : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
    </div>}
  </article>;
}
