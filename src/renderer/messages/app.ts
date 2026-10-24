import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const appMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  appName: {
    id: "appName",
    defaultMessage: "Atelier",
  },
  menu: {
    id: "menu",
    defaultMessage: "Atelier menu",
  },
  menuSettings: {
    id: "menuSettings",
    defaultMessage: "Settings",
  },
  workspaceNavigation: {
    id: "workspaceNavigation",
    defaultMessage: "Workspace navigation",
  },
  skipToContent: {
    id: "skipToContent",
    defaultMessage: "Skip to content",
  },
  appNavigation: {
    id: "appNavigation",
    defaultMessage: "Application navigation",
  },
  mainViews: {
    id: "mainViews",
    defaultMessage: "Main views",
  },
  showSidebar: {
    id: "showSidebar",
    defaultMessage: "Show sidebar",
  },
  hideSidebar: {
    id: "hideSidebar",
    defaultMessage: "Hide sidebar",
  },
  noConversations: {
    id: "noConversations",
    defaultMessage: "Your conversations will appear here.",
  },
  loadingConversations: {
    id: "loadingConversations",
    defaultMessage: "Loading conversations…",
  },
  addToWorkbench: {
    id: "app_App_1",
    defaultMessage: "Add to workbench",
  },
  add: {
    id: "app_App_2",
    defaultMessage: "Add",
  },
  agents: {
    id: "app_App_3",
    defaultMessage: "Agents",
  },
  resources: {
    id: "app_App_4",
    defaultMessage: "Resources",
  },
  connectionLost: {
    id: "app_App_5",
    defaultMessage: "The connection was lost. Retry the same message to recover the submitted conversation.",
  },
  renameConversation: {
    id: "conversation.rename",
    defaultMessage: "Rename conversation",
  },
  renameConversationDescription: {
    id: "conversation.rename.description",
    defaultMessage: "Choose a title to keep instead of automatic suggestions.",
  },
  conversationTitle: {
    id: "conversation.title",
    defaultMessage: "Title",
  },
  conversationActions: {
    id: "conversation.actions",
    defaultMessage: "Actions for {title}",
  },
  moreActions: {
    id: "conversation.moreActions",
    defaultMessage: "More actions",
  },
  archiveConversation: {
    id: "conversation.archive",
    defaultMessage: "Archive conversation",
  },
  archiveConversationTitle: {
    id: "conversation.archive.title",
    defaultMessage: "Archive this conversation?",
  },
  archiveConversationDescription: {
    id: "conversation.archive.description",
    defaultMessage: "Archiving ends the running instances of its resources. The conversation moves to the recycle bin in Settings and is removed after about a month.",
  },
  archiveConfirm: {
    id: "conversation.archive.confirm",
    defaultMessage: "Archive",
  },
}));
