import { Cpu, List } from "lucide-react";
import { toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { modelMessages } from "../messages/models";
import { GetModelResult, ListModelsResult } from "./contract";
import { getModelView, listModelsView } from "./views";

export default {
  resources: [], cards: [],
  tools: [
    toolRenderer(ListModelsResult, { label: modelMessages.list, icon: <List className="size-3.5" />, ...listModelsView }),
    toolRenderer(GetModelResult, { label: modelMessages.get, icon: <Cpu className="size-3.5" />, ...getModelView }),
  ],
} satisfies RendererModule;
