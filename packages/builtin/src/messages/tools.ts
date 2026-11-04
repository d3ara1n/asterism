import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const toolsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  toolCallDetails: {
    id: "toolCallDetails",
    defaultMessage: "Call details",
  },
  toolResultDetails: {
    id: "toolResultDetails",
    defaultMessage: "Result details",
  },
}));
