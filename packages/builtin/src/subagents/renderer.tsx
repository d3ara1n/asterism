import { Boxes, Search, Hourglass, Send, Square, MessageSquarePlus } from "lucide-react";
import { cardRenderer, creationEntry, recordRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { subagentPoolCard as appearance } from "../shared/card-appearance";
import { subagentMessages as messages } from "../messages/subagents";
import { SubagentPool, CreateSubagentPool, PoolView, Delegation, Delegate, Check, Wait, Steer, Cancel, type TaskSnapshot } from "./contract";
import { PoolCard, TaskReport } from "./PoolCard";

function Report({ result }: ToolRenderProps<TaskSnapshot>) { return result?.data ? <TaskReport task={result.data} /> : null; }
export default {
  resources: [{ kind: SubagentPool.kind, label: messages.title, icon: <Boxes className="size-4" />, card: appearance }],
  cards: [cardRenderer(PoolView, { ...appearance, Body: PoolCard })],
  creations: [creationEntry(CreateSubagentPool, { id: CreateSubagentPool.id, label: messages.title, icon: <Boxes className="size-4" />,
    group: "resources", triggers: { menu: { initialInput: {} } } })],
  records: [recordRenderer(Delegation, { icon: <Boxes className="size-4" />,
    label: data => `${data.input.id} · ${data.input.role} · ${data.input.task}` })],
  tools: [
    toolRenderer(Delegate, { label: messages.delegate, icon: <Send className="size-3.5" /> }),
    toolRenderer(Check, { label: messages.check, icon: <Search className="size-3.5" />, result: { bodyRenderer: Report } }),
    toolRenderer(Wait, { label: messages.wait, icon: <Hourglass className="size-3.5" /> }),
    toolRenderer(Steer, { label: messages.steer, icon: <MessageSquarePlus className="size-3.5" /> }),
    toolRenderer(Cancel, { label: messages.cancel, icon: <Square className="size-3.5" /> }),
  ],
} satisfies RendererModule;
