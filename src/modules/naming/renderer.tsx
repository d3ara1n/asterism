import { recordRenderer, type RendererModule } from "@atelier/sdk/renderer";
import { withValues } from "@atelier/sdk/contracts";
import { PenLine } from "lucide-react";

import { recordMessages } from "../messages/records";
import { SessionNamed } from "./records";

export default {
  resources: [], cards: [], tools: [],
  records: [recordRenderer(SessionNamed, { icon: <PenLine className="size-4" />,
    label: data => withValues(recordMessages.recordSessionNamed, { title: data.title }) })],
} satisfies RendererModule;
