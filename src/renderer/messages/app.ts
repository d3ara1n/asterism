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
}));
