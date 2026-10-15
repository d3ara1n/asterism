import { useI18n, type CardPanelDefinition } from "@atelier/sdk/renderer";
import { Layers, Stethoscope } from "lucide-react";
import type { z } from "zod";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../renderer/shared/ui/empty";
import { agentPanelMessages as messages } from "../messages/agent-panels";
import { AgentView } from "./contract";
import { Diagnostics } from "./diagnostics/Diagnostics";

function Context() {
  const i18n = useI18n();
  return <Empty className="flex-1">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Layers /></EmptyMedia>
      <EmptyTitle>{i18n.text(messages.placeholder)}</EmptyTitle>
      <EmptyDescription>{i18n.text(messages.contextHint)}</EmptyDescription>
    </EmptyHeader>
  </Empty>;
}

export const agentPanels = [
  { id: "diagnostics", label: messages.diagnostics, icon: <Stethoscope />, Body: Diagnostics },
  { id: "context", label: messages.context, icon: <Layers />, Body: Context },
] satisfies readonly CardPanelDefinition<z.infer<typeof AgentView.schema>>[];
