import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const modelMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  list: { id: "models.list", defaultMessage: "List models" },
  get: { id: "models.get", defaultMessage: "Read model" },
}));
