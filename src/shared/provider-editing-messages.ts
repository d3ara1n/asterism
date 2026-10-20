import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const providerEditingMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  fixed: {
    id: "providerEditing.fixed",
    defaultMessage: "These connection settings are fixed. Add a custom connection to use different settings.",
  },
}));
