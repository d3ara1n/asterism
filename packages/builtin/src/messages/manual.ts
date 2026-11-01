import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const manualMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  title: { id: "manual.title", defaultMessage: "Manual" },
}));
