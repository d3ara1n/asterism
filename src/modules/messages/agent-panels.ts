import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const agentPanelMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  diagnostics: { id: "agentPanels.diagnostics", defaultMessage: "Diagnostics" },
  context: { id: "agentPanels.context", defaultMessage: "Context" },
}));
