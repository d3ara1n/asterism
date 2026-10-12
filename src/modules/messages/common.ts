import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const commonMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  newConversation: {
    id: "newConversation",
    defaultMessage: "New conversation",
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
  viewingHistory: {
    id: "viewingHistory",
    defaultMessage: "Viewing history",
  },
  backToLive: {
    id: "backToLive",
    defaultMessage: "Back to live",
  },
  statusUnavailable: {
    id: "statusUnavailable",
    defaultMessage: "Connection unavailable",
  },
  unavailableTitle: {
    id: "unavailableTitle",
    defaultMessage: "This conversation could not be opened",
  },
  unavailableBody: {
    id: "unavailableBody",
    defaultMessage: "Try again or choose another conversation from the sidebar.",
  },
  kindAgent: {
    id: "kindAgent",
    defaultMessage: "Agent",
  },
  kindNote: {
    id: "kindNote",
    defaultMessage: "Note",
  },
  name: {
    id: "name",
    defaultMessage: "Name",
  },
  nameRequired: {
    id: "nameRequired",
    defaultMessage: "Enter a name.",
  },
  content: {
    id: "content",
    defaultMessage: "Content",
  },
  agent: {
    id: "agent",
    defaultMessage: "Agent",
  },
}));
