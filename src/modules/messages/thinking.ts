import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const thinkingMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
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
