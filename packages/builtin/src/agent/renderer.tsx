import { AgentView } from "./data.ts";
import { creationEntry, cardRenderer, useRendererObject, type RendererModule } from "@asterism-app/sdk/renderer";
import { Bot } from "lucide-react";
import type { z } from "zod";

import { commonMessages } from "../messages/common";
import { builtin, CreateAgent } from "@asterism-app/builtin-api/contracts";
import { agentUI } from "@asterism-app/builtin-api/renderer";
import { Conversation, ConversationActions } from "./conversation/Conversation";
import { AgentInput } from "./creation";
import { agentRecordViews } from "./history";
import { agentPanels } from "./panels";
import { AgentUI } from "./ui/AgentUI";
import { AgentConversationProvider, useAgentConversation } from "./conversation/interaction";
import { ConfigurationToolbarItem, ContextToolbarItem } from "./conversation/Toolbar";
import { peekToolRenderer } from "./peek/view";
import { sendToolRenderer } from "./send/view";
import { waitToolRenderer } from "./wait/view";

import { agentCard as appearance } from "../shared/card-appearance.ts";

export default {
  resources: [{ kind: "asterism.builtin/agent", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, card: appearance, receivesLinks: true }],
  cards: [cardRenderer(AgentView, {
    ...appearance,
    Body: AgentBody,
    Actions: ConversationActions,
    panels: agentPanels,
  })],
  tools: [peekToolRenderer, sendToolRenderer, waitToolRenderer],
  records: agentRecordViews,
  creations: [creationEntry(CreateAgent, { id: "asterism.builtin/agent.configured", label: commonMessages.kindAgent, icon: <Bot className="size-4" />, group: "agents", InputView: AgentInput, triggers: { menu: {} } })],
  async prepare({ signal }) {
    agentUI.register({ id: builtin.name("agent.configuration"), Component: ConfigurationToolbarItem }, { signal });
    agentUI.register({ id: builtin.name("agent.context"), Component: ContextToolbarItem }, { signal });
  },
} satisfies RendererModule;

function AgentBody({ data }: { data: z.infer<typeof AgentView.schema> }) {
  const object = useRendererObject();
  const interaction = useAgentConversation(object, data.selection !== null, data.executionState, data.drafts);
  return <AgentConversationProvider value={interaction}>
    <AgentUI selection={data.selection}><Conversation feedback={data.feedback} compressions={data.compressions} /></AgentUI>
  </AgentConversationProvider>;
}
