import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const pluginConfigurationMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  notSet: {
    id: "features_plugins_PluginConfigurations_1",
    defaultMessage: "Not set",
  },
  invalidJson: {
    id: "features_plugins_PluginConfigurations_2",
    defaultMessage: "Enter a valid JSON value.",
  },
  leaveUnset: {
    id: "features_plugins_PluginConfigurations_3",
    defaultMessage: "Leave unset",
  },
  notSetOption: {
    id: "features_plugins_PluginConfigurations_4",
    defaultMessage: "Not set",
  },
  selectValue: {
    id: "features_plugins_PluginConfigurations_5",
    defaultMessage: "Select a value",
  },
  leaveUnsetOption: {
    id: "features_plugins_PluginConfigurations_6",
    defaultMessage: "Leave unset",
  },
  unavailable: {
    id: "features_plugins_PluginConfigurations_7",
    defaultMessage: "The plugin configuration is no longer available.",
  },
  saveFailed: {
    id: "features_plugins_PluginConfigurations_8",
    defaultMessage: "Configuration could not be saved. Reload before retrying.",
  },
  readFailed: {
    id: "features_plugins_PluginConfigurations_9",
    defaultMessage: "The saved configuration could not be read. Defaults are shown; saving will replace it.",
  },
  save: {
    id: "features_plugins_PluginConfigurations_11",
    defaultMessage: "Save",
  },
  restoreDefaults: {
    id: "features_plugins_PluginConfigurations_12",
    defaultMessage: "Restore defaults",
  },
  discardChanges: {
    id: "features_plugins_PluginConfigurations_13",
    defaultMessage: "Discard changes",
  },
}));
