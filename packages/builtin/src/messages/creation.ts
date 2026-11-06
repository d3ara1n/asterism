import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const creationMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  chooseAgent: {
    id: "conversation.creation.chooseAgent",
    defaultMessage: "Choose agent",
  },
}));
