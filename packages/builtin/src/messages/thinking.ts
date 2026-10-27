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
  thinkingInterrupted: {
    id: "thinkingInterrupted",
    defaultMessage: "Interrupted",
  },
  thinkingElapsed: {
    id: "thinkingElapsed",
    defaultMessage: "Elapsed {duration}",
  },
}));
