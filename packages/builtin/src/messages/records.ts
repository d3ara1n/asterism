import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const recordMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  recordSessionNamed: {
    id: "history.session.named",
    defaultMessage: "Named the session: {title}",
  },
}));
