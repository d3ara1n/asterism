import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const appMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  keepAwake: { id: "sessions.keepAwake", defaultMessage: "Keep awake" },
  sleeping: { id: "sessions.sleeping", defaultMessage: "Sleeping" },
  completed: { id: "sessions.completed", defaultMessage: "Completed" },
  appName: {
    id: "app.name",
    defaultMessage: "Asterism",
  },
  menu: {
    id: "app.menu.label",
    defaultMessage: "Asterism menu",
  },
  menuSettings: {
    id: "app.menu.settings",
    defaultMessage: "Settings",
  },
  workspaceNavigation: {
    id: "app.navigation.workspace",
    defaultMessage: "Workspace navigation",
  },
  skipToContent: {
    id: "app.navigation.skipToContent",
    defaultMessage: "Skip to content",
  },
  appNavigation: {
    id: "app.navigation.application",
    defaultMessage: "Application navigation",
  },
  mainViews: {
    id: "app.navigation.mainViews",
    defaultMessage: "Main views",
  },
  showSidebar: {
    id: "app.sidebar.show",
    defaultMessage: "Show sidebar",
  },
  hideSidebar: {
    id: "app.sidebar.hide",
    defaultMessage: "Hide sidebar",
  },
  sidebarView: { id: "sidebar.view", defaultMessage: "Conversation view" },
  sidebarViewFolders: { id: "sidebar.view.folders", defaultMessage: "Folders" },
  sidebarViewRecent: { id: "sidebar.view.recent", defaultMessage: "Recent" },
  usagePanel: { id: "sidebar.usage", defaultMessage: "Usage" },
  noConversations: {
    id: "app.conversations.empty",
    defaultMessage: "Your conversations will appear here.",
  },
  loadingConversations: {
    id: "app.conversations.loading",
    defaultMessage: "Loading conversations…",
  },
  addToWorkbench: {
    id: "workbench.add.label",
    defaultMessage: "Add to workbench",
  },
  add: {
    id: "workbench.add.action",
    defaultMessage: "Add",
  },
  agents: {
    id: "workbench.add.agents",
    defaultMessage: "Agents",
  },
  resources: {
    id: "workbench.add.resources",
    defaultMessage: "Resources",
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
