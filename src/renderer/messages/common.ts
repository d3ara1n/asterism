import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const commonMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  workbench: {
    id: "workbench",
    defaultMessage: "Workbench",
  },
  home: {
    id: "home",
    defaultMessage: "Home",
  },
  back: {
    id: "back",
    defaultMessage: "Back",
  },
  newConversation: {
    id: "newConversation",
    defaultMessage: "New conversation",
  },
  conversation: {
    id: "conversation",
    defaultMessage: "Conversation",
  },
  conversations: {
    id: "conversations",
    defaultMessage: "Conversations",
  },
  model: {
    id: "model",
    defaultMessage: "Model",
  },
  sendMessage: {
    id: "sendMessage",
    defaultMessage: "Send message",
  },
  retry: {
    id: "retry",
    defaultMessage: "Try again",
  },
  close: {
    id: "close",
    defaultMessage: "Close",
  },
  live: {
    id: "live",
    defaultMessage: "Live",
  },
  statusBusy: {
    id: "statusBusy",
    defaultMessage: "Saving…",
  },
  statusReady: {
    id: "statusReady",
    defaultMessage: "Local workspace",
  },
  statusUnavailable: {
    id: "statusUnavailable",
    defaultMessage: "Connection unavailable",
  },
  dismissError: {
    id: "dismissError",
    defaultMessage: "Dismiss error",
  },
  unavailableTitle: {
    id: "unavailableTitle",
    defaultMessage: "This conversation could not be opened",
  },
  unavailableBody: {
    id: "unavailableBody",
    defaultMessage: "Try again or choose another conversation from the sidebar.",
  },
  expand: {
    id: "expand",
    defaultMessage: "Expand",
  },
  collapse: {
    id: "collapse",
    defaultMessage: "Collapse",
  },
  closeView: {
    id: "closeView",
    defaultMessage: "Hide card",
  },
  zoomIn: {
    id: "zoomIn",
    defaultMessage: "Zoom in",
  },
  resetZoom: {
    id: "resetZoom",
    defaultMessage: "Reset zoom to 100%",
  },
  zoomOut: {
    id: "zoomOut",
    defaultMessage: "Zoom out",
  },
  fitObjects: {
    id: "fitObjects",
    defaultMessage: "Fit all objects",
  },
  cancel: {
    id: "cancel",
    defaultMessage: "Cancel",
  },
  create: {
    id: "create",
    defaultMessage: "Create",
  },
  agent: {
    id: "agent",
    defaultMessage: "Agent",
  },
  renderFailedTitle: {
    id: "renderFailedTitle",
    defaultMessage: "The workspace could not be displayed",
  },
  renderFailedBody: {
    id: "renderFailedBody",
    defaultMessage: "Reload the window to read your saved work again.",
  },
  reload: {
    id: "reload",
    defaultMessage: "Reload",
  },
  runtimeStopped: {
    id: "runtimeStopped",
    defaultMessage: "The task runtime stopped. Restart Atelier to reopen your workspace.",
  },
  connectionLost: {
    id: "connectionLost",
    defaultMessage: "The application connection was lost. Restart Atelier before retrying.",
  },
  remove: {
    id: "remove",
    defaultMessage: "Remove",
  },
  creating: {
    id: "creating",
    defaultMessage: "Creating…",
  },
  all: {
    id: "all",
    defaultMessage: "All",
  },
  noMatches: {
    id: "noMatches",
    defaultMessage: "No matching items.",
  },
  thinkingTitle: {
    id: "thinkingTitle",
    defaultMessage: "Thinking",
  },
  loading: {
    id: "loading",
    defaultMessage: "Loading",
  },
  commandPalette: {
    id: "commandPalette",
    defaultMessage: "Command Palette",
  },
  commandSearch: {
    id: "commandSearch",
    defaultMessage: "Search for a command to run…",
  },
  thinkingOff: {
    id: "thinkingOff",
    defaultMessage: "Off",
  },
  thinkingMinimal: {
    id: "thinkingMinimal",
    defaultMessage: "Minimal",
  },
  thinkingLow: {
    id: "thinkingLow",
    defaultMessage: "Low",
  },
  thinkingMedium: {
    id: "thinkingMedium",
    defaultMessage: "Medium",
  },
  thinkingHigh: {
    id: "thinkingHigh",
    defaultMessage: "High",
  },
  thinkingXhigh: {
    id: "thinkingXhigh",
    defaultMessage: "Extra high",
  },
  thinkingMax: {
    id: "thinkingMax",
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
}));
