import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const namingMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  name: { id: "naming.name", defaultMessage: "Session name" },
  rename: { id: "naming.rename", defaultMessage: "Rename session" },
}));
