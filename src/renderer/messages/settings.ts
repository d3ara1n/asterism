import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const settingsMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  settings: {
    id: "settings",
    defaultMessage: "Settings",
  },
  allSettings: {
    id: "allSettings",
    defaultMessage: "All settings",
  },
  generalTitle: {
    id: "generalTitle",
    defaultMessage: "General",
  },
  generalSummary: {
    id: "generalSummary",
    defaultMessage: "Language and appearance",
  },
  languageLabel: {
    id: "languageLabel",
    defaultMessage: "Interface language",
  },
  rolesTitle: {
    id: "rolesTitle",
    defaultMessage: "Roles",
  },
  aboutTitle: {
    id: "aboutTitle",
    defaultMessage: "About",
  },
  aboutSummary: {
    id: "aboutSummary",
    defaultMessage: "A personal AI workshop",
  },
  aboutBody: {
    id: "aboutBody",
    defaultMessage: "Atelier brings agents, working materials and their progress to one workbench. Use your models, link the resources they need, and follow the work through cards and history. Conversations, notes and layout are saved on this device; resource operations require explicit authorization.",
  },
  aboutIdentity: {
    id: "aboutIdentity",
    defaultMessage: "Application ID",
  },
  appearance: {
    id: "features_settings_SettingsPage_1",
    defaultMessage: "Appearance",
  },
  appearanceSummary: {
    id: "features_settings_SettingsPage_2",
    defaultMessage: "Colors, density, and canvas",
  },
  providers: {
    id: "features_settings_SettingsPage_3",
    defaultMessage: "Providers",
  },
  providersSummary: {
    id: "features_settings_SettingsPage_4",
    defaultMessage: "Connections and available models",
  },
  rolesSummary: {
    id: "features_settings_SettingsPage_5",
    defaultMessage: "Reusable model roles",
  },
  agents: {
    id: "features_settings_SettingsPage_6",
    defaultMessage: "Agents",
  },
  agentsSummary: {
    id: "features_settings_SettingsPage_7",
    defaultMessage: "Prompts, tools, and delegation",
  },
  languageSystem: {
    id: "languageSystem",
    defaultMessage: "System",
  },
  languageSummary: {
    id: "languageSummary",
    defaultMessage: "Choose the interface language. Changes apply immediately.",
  },
  languageSaveFailed: {
    id: "languageSaveFailed",
    defaultMessage: "The language preference could not be saved.",
  },
}));
