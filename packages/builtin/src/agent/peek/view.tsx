import { toolRenderer } from "@asterism-app/sdk/renderer";
import { AgentPeek } from "./contract";
import { peekViews } from "../../shared/peek-view";

export const peekToolRenderer = toolRenderer(AgentPeek, peekViews);
