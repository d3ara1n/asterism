import { toolRenderer } from "@asterism-app/sdk/renderer";
import { AgentSend } from "./contract";
import { sendViews } from "../../shared/send-view";

export const sendToolRenderer = toolRenderer(AgentSend, sendViews);
