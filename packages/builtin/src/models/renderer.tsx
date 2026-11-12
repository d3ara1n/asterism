import { Bot, List } from "lucide-react";
import { toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { modelMessages } from "../messages/models";
import { GetModelResult, ListModelsResult } from "./contract";

export default {
  resources: [], cards: [],
  tools: [
    toolRenderer(ListModelsResult, { label: modelMessages.list, icon: <List className="size-3.5" />, input: {} }),
    toolRenderer(GetModelResult, { label: modelMessages.get, icon: <Bot className="size-3.5" />, input: {} }),
  ],
} satisfies RendererModule;
