import { Bot } from "lucide-react";
import { cardRenderer, type RendererModule } from "../../renderer/modules/registry";
import { t } from "../../renderer/shared/i18n";
import { Conversation, ConversationActions } from "../../renderer/features/conversation/Conversation";
import { agentView } from "../../renderer/features/conversation/registry";
import { useWorkbench } from "../../renderer/features/workbench/context";
import { AgentView } from "./contract";

export default {
  cards: [cardRenderer(AgentView, {
    label: t.kindAgent, icon: <Bot className="size-4" />, width: 560, height: 640, connection: "target",
    Body: ({ data }) => {
      const workbench = useWorkbench();
      return <Conversation view={agentView(workbench.session.id, data.agentId)} ready={workbench.ready}
        draft={workbench.draft} onDraftChange={workbench.onDraftChange} onHome={workbench.onHome} />;
    },
    Actions: ({ data }) => {
      const workbench = useWorkbench();
      return <ConversationActions view={agentView(workbench.session.id, data.agentId)} ready={workbench.ready} />;
    },
  })],
  results: [],
} satisfies RendererModule;
