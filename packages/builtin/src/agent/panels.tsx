import { AgentView } from "./data.ts";
import type { CardPanelDefinition } from "@asterism-app/sdk/renderer";
import { Layers, Stethoscope } from "lucide-react";
import type { z } from "zod";
import { agentPanelMessages as messages } from "../messages/agent-panels";

import { Diagnostics } from "./diagnostics/Diagnostics";
import { ContextPanel } from "./context/ContextPanel";
import { SkillReferences } from "../skills/references";

type Data = z.infer<typeof AgentView.schema>;
const DiagnosticsBody = () => <SkillReferences><Diagnostics /></SkillReferences>;

export const agentPanels = [
  { id: "diagnostics", label: messages.diagnostics, icon: <Stethoscope />, Body: DiagnosticsBody },
  { id: "context", label: messages.context, icon: <Layers />, Body: ContextPanel },
] satisfies readonly CardPanelDefinition<Data>[];
