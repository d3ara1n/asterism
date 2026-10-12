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
  agentModelUnavailable: {
    id: "features_home_HomePage_1",
    defaultMessage: "This agent’s default model configuration is unavailable. Select a model or update settings.",
  },
  configurationUnavailable: {
    id: "features_home_HomePage_2",
    defaultMessage: "The selected configuration is unavailable. Choose again.",
  },
  addModel: {
    id: "features_home_HomePage_3",
    defaultMessage: "Add a model in settings",
  },
  thinkingLevel: {
    id: "features_home_HomePage_4",
    defaultMessage: "Thinking level",
  },
  thinkingOff: {
    id: "features_home_HomePage_5",
    defaultMessage: "Off",
  },
  defaultThinking: {
    id: "features_home_HomePage_6",
    defaultMessage: "Default",
  },
  defaultModel: {
    id: "features_home_HomePage_7",
    defaultMessage: "Default",
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
