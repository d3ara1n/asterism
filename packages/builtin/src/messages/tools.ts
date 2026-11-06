import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const toolsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  toolCallDetails: {
    id: "conversation.tools.callDetails",
    defaultMessage: "Call details",
  },
  toolResultDetails: {
    id: "conversation.tools.resultDetails",
    defaultMessage: "Result details",
  },
}));
