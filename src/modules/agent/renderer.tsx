import { Bot } from "lucide-react";
import { cardRenderer, useRendererNavigation, type RendererModule } from "@atelier/sdk/renderer";
import { t } from "../../renderer/shared/i18n";
import { Conversation, ConversationActions } from "./conversation/Conversation";
import { AgentView } from "./contract";

const appearance = { width: 560, height: 640, minWidth: 480, minHeight: 480 };

export default {
  resources: [{ kind: "atelier.core/agent", label: t.kindAgent, icon: <Bot className="size-4" />, card: appearance, receivesLinks: true }],
  cards: [cardRenderer(AgentView, {
    ...appearance,
    Body: AgentBody,
    Actions: ConversationActions,
  })],
  tools: [],
} satisfies RendererModule;

function AgentBody({ data }: { data: { selection: import("../../shared/model").AgentSelection | null } }) {
  const navigation = useRendererNavigation();
  return <Conversation selection={data.selection} onHome={navigation.home} />;
}
