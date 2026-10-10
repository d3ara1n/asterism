import { Bot } from "lucide-react";
import { cardRenderer, type RendererModule } from "../../renderer/modules/registry";
import { t } from "../../renderer/shared/i18n";
import { Conversation, ConversationActions } from "../../renderer/features/conversation/Conversation";
import { agentView } from "../../renderer/features/session/registry";
import { useWorkbench } from "../../renderer/features/workbench/context";
import { AgentView } from "./contract";

const appearance = { width: 560, height: 640, minWidth: 480, minHeight: 480 };

export default {
  resources: [{ kind: "agent", label: t.kindAgent, icon: <Bot className="size-4" />, card: appearance }],
  cards: [cardRenderer(AgentView, {
    ...appearance,
    Body: ({ data }) => {
      const workbench = useWorkbench();
      return <Conversation view={agentView(workbench.controller, data.agentId)} selection={data.selection} ready={workbench.ready}
        draft={workbench.draft(data.agentId)} onDraftChange={value => workbench.onDraftChange(data.agentId, value)} onHome={workbench.onHome} />;
    },
    Actions: ({ data }) => {
      const workbench = useWorkbench();
      return <ConversationActions view={agentView(workbench.controller, data.agentId)} ready={workbench.ready} />;
    },
  })],
  tools: [],
} satisfies RendererModule;
