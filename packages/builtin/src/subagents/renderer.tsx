import { Boxes, Search, Hourglass, Send, Square, MessageSquarePlus } from "lucide-react";
import { cardRenderer, creationEntry, recordRenderer, toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { subagentPoolCard as appearance } from "../shared/card-appearance";
import { subagentMessages as messages } from "../messages/subagents";
import { SubagentPool, CreateSubagentPool, PoolView, Delegation, Delegate, Check, Wait, Steer, Cancel } from "./contract";
import { PoolCard } from "./PoolCard";
import { delegateViews, checkViews, waitViews, steerViews, cancelViews } from "./tool-views";

export default {
  resources: [{ kind: SubagentPool.kind, label: messages.title, icon: <Boxes className="size-4" />, card: appearance }],
  cards: [cardRenderer(PoolView, { ...appearance, Body: PoolCard })],
  creations: [creationEntry(CreateSubagentPool, { id: CreateSubagentPool.id, label: messages.title, icon: <Boxes className="size-4" />,
    group: "resources", triggers: { menu: { initialInput: {} } } })],
  records: [recordRenderer(Delegation, { icon: <Boxes className="size-4" />,
    label: data => `${data.input.id} · ${data.input.role} · ${data.input.task}` })],
  tools: [
    toolRenderer(Delegate, { ...delegateViews, icon: <Send className="size-3.5" /> }),
    toolRenderer(Check, { ...checkViews, icon: <Search className="size-3.5" /> }),
    toolRenderer(Wait, { ...waitViews, icon: <Hourglass className="size-3.5" /> }),
    toolRenderer(Steer, { ...steerViews, icon: <MessageSquarePlus className="size-3.5" /> }),
    toolRenderer(Cancel, { ...cancelViews, icon: <Square className="size-3.5" /> }),
  ],
} satisfies RendererModule;
