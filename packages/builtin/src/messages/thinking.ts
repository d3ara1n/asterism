import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const thinkingMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  thinkingTitle: {
    id: "thinkingTitle",
    defaultMessage: "Thinking",
  },
  thinkingActive: {
    id: "thinkingActive",
    defaultMessage: "Thinking…",
  },
  thinkingElapsed: {
    id: "thinkingElapsed",
    defaultMessage: "Elapsed {duration}",
  },
}));
