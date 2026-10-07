import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, FileText, Maximize2, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkbenchObject } from "../../../shared/contracts";
import { Button } from "../../shared/ui/button";
import { t } from "../../shared/i18n";
import { s } from "../configuration/state";

export type ObjectNodeType = Node<{
  object: WorkbenchObject;
  collapsed: boolean;
  historical: boolean;
  renderAgent?: (actions: ReactNode) => ReactNode;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

/** 节点身份沿用领域对象 ID；卡片不创建第二份代理、资源或执行状态。 */
export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed, renderAgent } = data;
  const actions = <div className="nodrag nopan flex">
    <Button variant="ghost" size="icon-xs" aria-label={collapsed ? t.expand : t.collapse} title={collapsed ? t.expand : t.collapse} disabled={data.historical} onClick={() => data.onView({ collapsed: !collapsed })}>{collapsed ? <Maximize2 /> : <Minus />}</Button>
    <Button variant="ghost" size="icon-xs" aria-label={t.closeView} title={t.closeView} disabled={data.historical} onClick={() => data.onView({ hidden: true })}><X /></Button>
  </div>;
  return <>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <Handle type="source" position={Position.Right} isConnectable={false} />
    <div className={`object-card h-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-md ${selected ? "border-ring" : ""}`}>
      {renderAgent && !collapsed ? renderAgent(actions) : <>
        <header className="agent-drag-handle flex cursor-grab items-center gap-2 p-3 active:cursor-grabbing">
          {object.kind === "agent" ? <Bot className="size-4 shrink-0 text-primary" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1"><p className="type-caption">{object.kind === "agent" ? t.kindAgent : t.kindNote}</p><h2 className="type-section truncate">{object.title}</h2></div>
          {actions}
        </header>
        {!collapsed && <div className="nodrag nopan nowheel max-h-80 select-text overflow-auto border-t p-4">
          {object.kind === "note" ? object.content_available
            ? <p className="type-body whitespace-pre-wrap break-words">{object.content}</p>
            : <p className="type-caption">{t.contentUnavailable}</p>
            : <p className="type-caption">{s("This agent has no conversation record yet.", "这个代理尚无对话记录。")}</p>}
        </div>}
      </>}
    </div>
  </>;
}
