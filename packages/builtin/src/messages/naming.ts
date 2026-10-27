import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const namingMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  name: { id: "naming.name", defaultMessage: "Session name" },
  rename: { id: "naming.rename", defaultMessage: "Rename session" },
}));
