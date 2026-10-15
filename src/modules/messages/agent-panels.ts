import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const agentPanelMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  diagnostics: { id: "agentPanels.diagnostics", defaultMessage: "Diagnostics" },
  context: { id: "agentPanels.context", defaultMessage: "Context" },
  placeholder: { id: "agentPanels.placeholder", defaultMessage: "Coming soon" },
  contextHint: { id: "agentPanels.contextHint", defaultMessage: "The context prepared for the next model request will appear here." },
}));
