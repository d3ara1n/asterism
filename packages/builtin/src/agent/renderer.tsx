import { AgentView } from "./data.ts";
import { creationEntry, cardRenderer, useRendererNavigation, useRendererObject, type RendererModule } from "@atelier/sdk/renderer";
import { Bot } from "lucide-react";
import type { z } from "zod";

import { commonMessages } from "../messages/common";
import { builtin, CreateAgent } from "@atelier/builtin-api/contracts";
import { agentUI } from "@atelier/builtin-api/renderer";
import { Conversation, ConversationActions } from "./conversation/Conversation";
import { AgentInput } from "./creation";
import { agentRecordViews } from "./history";
import { agentPanels } from "./panels";
import { AgentUI } from "./ui/AgentUI";
import { AgentConversationProvider, useAgentConversation } from "./conversation/interaction";
import { ConfigurationToolbarItem, ContextToolbarItem } from "./conversation/Toolbar";
import { agentExecutionState } from "./state";
import { peekToolRenderer } from "./peek/view";

const appearance = { width: 560, height: 640, minWidth: 480, minHeight: 480 };

export default {
  resources: [{ kind: "atelier.builtin/agent", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, card: appearance, receivesLinks: true }],
  cards: [cardRenderer(AgentView, {
    ...appearance,
    Body: AgentBody,
    Actions: ConversationActions,
    panels: agentPanels,
  })],
  tools: [peekToolRenderer],
  records: agentRecordViews,
  creations: [creationEntry(CreateAgent, { id: "atelier.builtin/agent.configured", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, group: "agents", InputView: AgentInput, triggers: { menu: {} } })],
  async prepare({ signal }) {
    agentUI.register({ id: builtin.name("agent.configuration"), Component: ConfigurationToolbarItem }, { signal });
    agentUI.register({ id: builtin.name("agent.context"), Component: ContextToolbarItem }, { signal });
  },
} satisfies RendererModule;

function AgentBody({ data }: { data: z.infer<typeof AgentView.schema> }) {
  const navigation = useRendererNavigation();
  const object = useRendererObject();
  const executionState = agentExecutionState(data.turnState, object.activity.running);
  const interaction = useAgentConversation(object, data.selection !== null, executionState);
  return <AgentConversationProvider value={interaction}>
    <AgentUI selection={data.selection}><Conversation onHome={navigation.home} /></AgentUI>
  </AgentConversationProvider>;
}
