import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const configurationMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  unavailableAgent: {
    id: "agent_conversation_ConfigurationPicker_1",
    defaultMessage: "Unavailable agent",
  },
  nextRequestHint: {
    id: "agent_conversation_ConfigurationPicker_8",
    defaultMessage: "Changes apply to the next request",
  },
}));
