import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const commonMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  workbench: {
    id: "common.navigation.workbench",
    defaultMessage: "Workbench",
  },
  home: {
    id: "common.navigation.home",
    defaultMessage: "Home",
  },
  back: {
    id: "common.navigation.back",
    defaultMessage: "Back",
  },
  newConversation: {
    id: "common.conversation.create",
    defaultMessage: "New conversation",
  },
  conversation: {
    id: "common.conversation.label",
    defaultMessage: "Conversation",
  },
  conversations: {
    id: "common.conversation.collection",
    defaultMessage: "Conversations",
  },
  model: {
    id: "common.model.label",
    defaultMessage: "Model",
  },
  sendMessage: {
    id: "common.message.send",
    defaultMessage: "Send message",
  },
  retry: {
    id: "common.actions.retry",
    defaultMessage: "Try again",
  },
  close: {
    id: "common.actions.close",
    defaultMessage: "Close",
  },
  notifications: {
    id: "common.notifications.label",
    defaultMessage: "Notifications",
  },
  live: {
    id: "common.status.live",
    defaultMessage: "Live",
  },
  statusBusy: {
    id: "common.status.saving",
    defaultMessage: "Saving…",
  },
  statusUnavailable: {
    id: "common.connection.unavailable",
    defaultMessage: "Connection unavailable",
  },
  unavailableTitle: {
    id: "common.conversation.unavailableTitle",
    defaultMessage: "This conversation could not be opened",
  },
  unavailableBody: {
    id: "common.conversation.unavailableDescription",
    defaultMessage: "Try again or choose another conversation from the sidebar.",
  },
  expand: {
    id: "common.actions.expand",
    defaultMessage: "Expand",
  },
  collapse: {
    id: "common.actions.collapse",
    defaultMessage: "Collapse",
  },
  zoomIn: {
    id: "common.zoom.in",
    defaultMessage: "Zoom in",
  },
  resetZoom: {
    id: "common.zoom.reset",
    defaultMessage: "Reset zoom to 100%",
  },
  zoomOut: {
    id: "common.zoom.out",
    defaultMessage: "Zoom out",
  },
  fitObjects: {
    id: "common.zoom.fitObjects",
    defaultMessage: "Fit all objects",
  },
  cancel: {
    id: "common.actions.cancel",
    defaultMessage: "Cancel",
  },
  create: {
    id: "common.actions.create",
    defaultMessage: "Create",
  },
  agent: {
    id: "common.agent.label",
    defaultMessage: "Agent",
  },
  renderFailedTitle: {
    id: "common.workspace.renderFailedTitle",
    defaultMessage: "The workspace could not be displayed",
  },
  renderFailedBody: {
    id: "common.workspace.renderFailedDescription",
    defaultMessage: "Reload the window to read your saved work again.",
  },
  reload: {
    id: "common.actions.reload",
    defaultMessage: "Reload",
  },
  runtimeStopped: {
    id: "common.runtime.stopped",
    defaultMessage: "The task runtime stopped. Restart Asterism to reopen your workspace.",
  },
  connectionLost: {
    id: "common.connection.lost",
    defaultMessage: "The application connection was lost. Restart Asterism before retrying.",
  },
  remove: {
    id: "common.actions.remove",
    defaultMessage: "Remove",
  },
  creating: {
    id: "common.status.creating",
    defaultMessage: "Creating…",
  },
  all: {
    id: "common.filter.all",
    defaultMessage: "All",
  },
  noMatches: {
    id: "common.search.noMatches",
    defaultMessage: "No matching items.",
  },
  thinkingTitle: {
    id: "common.thinking.label",
    defaultMessage: "Thinking",
  },
  loading: {
    id: "common.status.loading",
    defaultMessage: "Loading",
  },
  commandPalette: {
    id: "common.commands.title",
    defaultMessage: "Command Palette",
  },
  commandSearch: {
    id: "common.commands.searchPlaceholder",
    defaultMessage: "Search for a command to run…",
  },
  thinkingOff: {
    id: "common.thinking.off",
    defaultMessage: "Off",
  },
  thinkingMinimal: {
    id: "common.thinking.minimal",
    defaultMessage: "Minimal",
  },
  thinkingLow: {
    id: "common.thinking.low",
    defaultMessage: "Low",
  },
  thinkingMedium: {
    id: "common.thinking.medium",
    defaultMessage: "Medium",
  },
  thinkingHigh: {
    id: "common.thinking.high",
    defaultMessage: "High",
  },
  thinkingXhigh: {
    id: "common.thinking.extraHigh",
    defaultMessage: "Extra high",
  },
  thinkingMax: {
    id: "common.thinking.maximum",
    defaultMessage: "Maximum",
  },
  apiKey: {
    id: "provider.apiKey",
    defaultMessage: "API key",
  },
  baseUrl: {
    id: "provider.baseUrl",
    defaultMessage: "Base URL",
  },
  scrollToEnd: {
    id: "common.scroll.toEnd",
    defaultMessage: "Scroll to latest",
  },
  scrollToStart: {
    id: "common.scroll.toStart",
    defaultMessage: "Scroll to start",
  },
  wordWrap: {
    id: "common.text.wordWrap",
    defaultMessage: "Word wrap",
  },
  removeReference: {
    id: "common.references.remove",
    defaultMessage: "Remove reference",
  },
}));
