import { AgentView } from "./data.ts";
import type { CardPanelDefinition } from "@asterism/sdk/renderer";
import { Layers, Stethoscope } from "lucide-react";
import type { z } from "zod";
import { agentPanelMessages as messages } from "../messages/agent-panels";

import { Diagnostics } from "./diagnostics/Diagnostics";
import { ContextPanel } from "./context/ContextPanel";

export const agentPanels = [
  { id: "diagnostics", label: messages.diagnostics, icon: <Stethoscope />, Body: Diagnostics },
  { id: "context", label: messages.context, icon: <Layers />, Body: ContextPanel },
] satisfies readonly CardPanelDefinition<z.infer<typeof AgentView.schema>>[];
