import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const creationMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  chooseAgent: {
    id: "agent_creation_2",
    defaultMessage: "Choose agent",
  },
}));
