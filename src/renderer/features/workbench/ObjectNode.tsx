import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, FileText } from "lucide-react";
import type { WorkbenchObject } from "../../../shared/contracts";
import { t } from "../../shared/i18n";
import { Conversation, ConversationActions } from "../conversation/Conversation";
import { conversationSession } from "../conversation/session";
import { ObjectCard } from "./ObjectCard";
import { useWorkbench } from "./context";

/** 卡片尺寸是画布内的设计常量：主代理容纳连续阅读，其余对象为摘要卡。 */
export const cardSize = { object: { width: 340 }, agent: { width: 560, height: 640 } } as const;

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean; historical: boolean;
  onView: (patch: { hidden?: boolean; collapsed?: boolean }) => void;
}, "object">;

/** 节点身份沿用领域对象 ID；卡片不创建第二份代理、资源或执行状态。 */
export function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object, collapsed, historical, onView } = data;
  const card = { collapsed, historical, selected: !!selected, onView, title: object.title };
  return <>
    <Handle type={object.kind === "agent" ? "target" : "source"} position={object.kind === "agent" ? Position.Left : Position.Right} isConnectable={false} />
    {object.kind === "agent" ? <AgentCard agentId={object.id} {...card} />
      : <ObjectCard icon={<FileText className="size-4" />} kind={t.kindNote} width={cardSize.object.width} {...card}>
        <div className="max-h-80 select-text overflow-auto p-3">
          {object.content_available
            ? <p className="type-body whitespace-pre-wrap break-words">{object.content}</p>
            : <p className="type-body text-muted-foreground">{t.contentUnavailable}</p>}
        </div>
      </ObjectCard>}
  </>;
}

function AgentCard({ agentId, ...card }: { agentId: string; title: string; collapsed: boolean; historical: boolean; selected: boolean; onView: ObjectNodeType["data"]["onView"] }) {
  const workbench = useWorkbench();
  const session = conversationSession(workbench.task.id, agentId);
  return <ObjectCard icon={<Bot className="size-4" />} kind={t.kindAgent} {...cardSize.agent} {...card}
    actions={<ConversationActions session={session} ready={workbench.ready} onHistory={origin => workbench.openConversationHistory(agentId, origin)} />}>
    <Conversation session={session} ready={workbench.ready} draft={workbench.draft} onDraftChange={workbench.onDraftChange}
      onHome={workbench.onHome} onTurnEnded={workbench.onTurnEnded} />
  </ObjectCard>;
}
