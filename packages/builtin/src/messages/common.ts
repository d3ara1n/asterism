import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const commonMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  newConversation: {
    id: "conversation.new",
    defaultMessage: "New conversation",
  },
  model: {
    id: "common.model",
    defaultMessage: "Model",
  },
  sendMessage: {
    id: "conversation.sendMessage",
    defaultMessage: "Send message",
  },
  retry: {
    id: "common.retry",
    defaultMessage: "Try again",
  },
  statusUnavailable: {
    id: "connection.unavailable",
    defaultMessage: "Connection unavailable",
  },
  unavailableTitle: {
    id: "conversation.unavailable.title",
    defaultMessage: "This conversation could not be opened",
  },
  unavailableBody: {
    id: "conversation.unavailable.body",
    defaultMessage: "Try again or choose another conversation from the sidebar.",
  },
  kindAgent: {
    id: "resources.kind.agent",
    defaultMessage: "Agent",
  },
  kindNote: {
    id: "resources.kind.note",
    defaultMessage: "Note",
  },
  name: {
    id: "common.name",
    defaultMessage: "Name",
  },
  nameRequired: {
    id: "common.nameRequired",
    defaultMessage: "Enter a name.",
  },
  content: {
    id: "common.content",
    defaultMessage: "Content",
  },
  agent: {
    id: "common.agent",
    defaultMessage: "Agent",
  },
}));
