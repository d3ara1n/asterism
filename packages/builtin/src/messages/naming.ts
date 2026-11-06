import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const namingMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  autoRename: { id: "naming.autoRename", defaultMessage: "Auto-rename" },
  failed: { id: "naming.failed", defaultMessage: "Session could not be renamed." },
  noMaterial: { id: "naming.noMaterial", defaultMessage: "No conversation to name" },
  utilityUnavailable: { id: "naming.utilityUnavailable", defaultMessage: "Utility model unavailable" },
  name: { id: "naming.name", defaultMessage: "Session name" },
  rename: { id: "naming.rename", defaultMessage: "Rename session" },
}));
