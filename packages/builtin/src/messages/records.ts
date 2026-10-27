import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const recordMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  recordSessionNamed: {
    id: "recordSessionNamed",
    defaultMessage: "Named the session: {title}",
  },
}));
