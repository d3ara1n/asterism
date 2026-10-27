import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const manualMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  title: { id: "manual.title", defaultMessage: "Manual" },
  description: { id: "manual.description", defaultMessage: "Asterism usage and plugin development. Link this manual to an agent to look up relevant topics." },
}));
