import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const agentPanelMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  diagnostics: { id: "agentPanels.diagnostics", defaultMessage: "Diagnostics" },
  context: { id: "agentPanels.context", defaultMessage: "Context" },
}));
