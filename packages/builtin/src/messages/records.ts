import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const recordMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  recordSessionNamed: {
    id: "recordSessionNamed",
    defaultMessage: "Named the session: {title}",
  },
}));
