import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";
export const toolsMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  toolNoOutput: { id: "toolNoOutput", defaultMessage: "No output was produced." },
}));
