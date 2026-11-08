import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const commonMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  sendMessage: {
    id: "conversation.sendMessage",
    defaultMessage: "Send message",
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
