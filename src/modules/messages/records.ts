import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const recordMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  recordSessionNamed: {
    id: "recordSessionNamed",
    defaultMessage: "Named the session: {title}",
  },
}));
