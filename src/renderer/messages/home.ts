import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const homeMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
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
  setupProvider: {
    id: "home.setup.provider",
    defaultMessage: "Add a model provider to connect Asterism to your AI service.",
  },
  openProviders: {
    id: "home.setup.openProviders",
    defaultMessage: "Configure providers",
  },
  setupModel: {
    id: "home.setup.model",
    defaultMessage: "Add at least one model under your provider so it appears in model choices.",
  },
  openModels: {
    id: "home.setup.openModels",
    defaultMessage: "Add a model",
  },
  setupRole: {
    id: "home.setup.role",
    defaultMessage: "Choose a preferred model for a model role. You can start with default.",
  },
  openRoles: {
    id: "home.setup.openRoles",
    defaultMessage: "Configure model roles",
  },
  workbenchHint: {
    id: "home.workbenchHint",
    defaultMessage: "Start with a task. Organize materials, explore results, and follow the process with your agent.",
  },
}));
