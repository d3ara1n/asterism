import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const providerEditingMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  fixed: {
    id: "providerEditing.fixed",
    defaultMessage: "These connection settings are fixed. Add a custom connection to use different settings.",
  },
}));
