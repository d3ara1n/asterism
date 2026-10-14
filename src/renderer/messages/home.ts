import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const homeMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  homePrompt: {
    id: "homePrompt",
    defaultMessage: "What would you like to work on?",
  },
  homePlaceholder: {
    id: "homePlaceholder",
    defaultMessage: "Describe what you have in mind…",
  },
  firstMessage: {
    id: "firstMessage",
    defaultMessage: "Your first message",
  },
  startingConversation: {
    id: "features_home_HomePage_8",
    defaultMessage: "Starting conversation…",
  },
  keyboardHint: {
    id: "features_home_HomePage_9",
    defaultMessage: "Enter to send · Shift + Enter for a new line",
  },
}));
