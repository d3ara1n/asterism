import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const settingsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  languageLoadFailed: { id: "settings.language.loadFailed", defaultMessage: "The language preference could not be loaded." },
  settings: {
    id: "settings.title",
    defaultMessage: "Settings",
  },
  allSettings: {
    id: "settings.all",
    defaultMessage: "All settings",
  },
  generalTitle: {
    id: "settings.general.title",
    defaultMessage: "General",
  },
  sidebarTitle: { id: "settings.sidebar.title", defaultMessage: "Sidebar" },
  showUsage: { id: "settings.sidebar.showUsage", defaultMessage: "Show usage" },
  generalSummary: {
    id: "settings.general.summary",
    defaultMessage: "App preferences and management",
  },
  languageTitle: {
    id: "settings.language.title",
    defaultMessage: "Language",
  },
  languageLabel: {
    id: "settings.language.label",
    defaultMessage: "Interface language",
  },
  aboutTitle: {
    id: "settings.about.title",
    defaultMessage: "About",
  },
  aboutSummary: {
    id: "settings.about.summary",
    defaultMessage: "A personal AI workbench",
  },
  aboutIdentity: {
    id: "settings.about.identity.label",
    defaultMessage: "Application ID",
  },
  aboutLogs: {
    id: "settings.about.logs.label",
    defaultMessage: "Logs",
  },
  aboutOpenLogs: {
    id: "settings.about.logs.open",
    defaultMessage: "Open folder",
  },
  aboutCopyIdentity: {
    id: "settings.about.identity.copy",
    defaultMessage: "Copy application ID",
  },
  aboutIdentityCopied: {
    id: "settings.about.identity.copied",
    defaultMessage: "Application ID copied",
  },
  aboutIdentityCopyFailed: {
    id: "settings.about.identity.copyFailed",
    defaultMessage: "Application ID could not be copied",
  },
  appearance: {
    id: "settings.appearance.title",
    defaultMessage: "Appearance",
  },
  appearanceSummary: {
    id: "settings.appearance.summary",
    defaultMessage: "Colors, density, and canvas",
  },
  providers: {
    id: "settings.providers.title",
    defaultMessage: "Providers",
  },
  providersSummary: {
    id: "settings.providers.summary",
    defaultMessage: "Model and web service connections",
  },
  languageSystem: {
    id: "settings.language.system",
    defaultMessage: "System",
  },
  languageSummary: {
    id: "settings.language.summary",
    defaultMessage: "Choose the interface language. Changes apply immediately.",
  },
  languageSaveFailed: {
    id: "settings.language.saveFailed",
    defaultMessage: "The language preference could not be saved.",
  },
  conversationsTitle: {
    id: "conversations.title",
    defaultMessage: "Conversations",
  },
  conversationCount: {
    id: "conversations.count",
    defaultMessage: "{count, plural, one {# conversation} other {# conversations}}",
  },
  archivedCount: {
    id: "conversations.archivedCount",
    defaultMessage: "{count, plural, =0 {Recycle bin is empty} one {# archived conversation} other {# archived conversations}}",
  },
  recycleBin: {
    id: "conversations.recycleBin",
    defaultMessage: "Recycle bin",
  },
  retentionDays: { id: "conversations.retentionDays", defaultMessage: "Delete archived conversations after" },
  sleepDays: { id: "conversations.sleepDays", defaultMessage: "Sleep when idle for" },
  lifecycleDays: { id: "conversations.lifecycleDays", defaultMessage: "{days, plural, one {# day} other {# days}}" },
  lifecycleNever: { id: "conversations.lifecycleNever", defaultMessage: "Never" },
  recycleBinEmpty: {
    id: "conversations.recycleBin.empty",
    defaultMessage: "No archived conversations.",
  },
  archivedAt: {
    id: "conversations.archivedAt",
    defaultMessage: "Archived {date}",
  },
  restoreConversation: {
    id: "conversations.restore",
    defaultMessage: "Restore",
  },
  restoreConversationLabel: {
    id: "conversations.restore.label",
    defaultMessage: "Restore {title}",
  },
}));
