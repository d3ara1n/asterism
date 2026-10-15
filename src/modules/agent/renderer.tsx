import { creationEntry, cardRenderer, useRendererNavigation, type RendererModule } from "@atelier/sdk/renderer";
import { Bot } from "lucide-react";
import type { z } from "zod";

import { commonMessages } from "../messages/common";
import { CreateAgent, AgentView } from "./contract";
import { Conversation, ConversationActions } from "./conversation/Conversation";
import { AgentInput } from "./creation";
import { agentRecordViews } from "./history";
import { agentPanels } from "./panels";

const appearance = { width: 560, height: 640, minWidth: 480, minHeight: 480 };

export default {
  resources: [{ kind: "atelier.core/agent", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, card: appearance, receivesLinks: true }],
  cards: [cardRenderer(AgentView, {
    ...appearance,
    Body: AgentBody,
    Actions: ConversationActions,
    panels: agentPanels,
  })],
  tools: [],
  records: agentRecordViews,
  creations: [creationEntry(CreateAgent, { id: "atelier.core/agent.configured", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, group: "agents", InputView: AgentInput, triggers: { menu: {} } })],
} satisfies RendererModule;

function AgentBody({ data }: { data: z.infer<typeof AgentView.schema> }) {
  const navigation = useRendererNavigation();
  return <Conversation selection={data.selection} turnState={data.turnState} onHome={navigation.home} />;
}
