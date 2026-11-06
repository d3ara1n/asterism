import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const thinkingMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  thinkingTitle: {
    id: "conversation.thinking.completed",
    defaultMessage: "Thought",
  },
  thinkingActive: {
    id: "conversation.thinking.active",
    defaultMessage: "Thinking…",
  },
  thinkingElapsed: {
    id: "conversation.thinking.elapsed",
    defaultMessage: "Elapsed {duration}",
  },
}));
