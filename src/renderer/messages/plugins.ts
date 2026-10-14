import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const pluginsMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  loaded: {
    id: "features_plugins_PluginsSettings_1",
    defaultMessage: "Loaded",
  },
  disabled: {
    id: "features_plugins_PluginsSettings_2",
    defaultMessage: "Disabled",
  },
  invalidPackage: {
    id: "features_plugins_PluginsSettings_3",
    defaultMessage: "Invalid package",
  },
  failed: {
    id: "features_plugins_PluginsSettings_4",
    defaultMessage: "Failed",
  },
  restartRequired: {
    id: "features_plugins_PluginsSettings_5",
    defaultMessage: "Takes effect after restart",
  },
  addPackageHint: {
    id: "features_plugins_PluginsSettings_6",
    defaultMessage: "Add a package folder that contains an Atelier manifest. Changes take effect after restarting.",
  },
  restartHint: {
    id: "features_plugins_PluginsSettings_7",
    defaultMessage: "Restart Atelier to apply plugin changes.",
  },
  packages: {
    id: "features_plugins_PluginsSettings_8",
    defaultMessage: "Plugin packages",
  },
  unknownPlugin: {
    id: "features_plugins_PluginsSettings_9",
    defaultMessage: "Unknown plugin",
  },
  disable: {
    id: "features_plugins_PluginsSettings_10",
    defaultMessage: "Disable",
  },
  enable: {
    id: "features_plugins_PluginsSettings_11",
    defaultMessage: "Enable",
  },
  remove: {
    id: "features_plugins_PluginsSettings_12",
    defaultMessage: "Remove",
  },
  addPackage: {
    id: "features_plugins_PluginsSettings_13",
    defaultMessage: "Add package…",
  },
  settingsLoadFailed: {
    id: "features_plugins_PluginsSettings_14",
    defaultMessage: "Plugin settings could not be loaded.",
  },
  settingsLabel: {
    id: "features_plugins_PluginsSettings_16",
    defaultMessage: "Plugin settings",
  },
  reload: {
    id: "features_plugins_PluginsSettings_17",
    defaultMessage: "Reload",
  },
  settingsHint: {
    id: "features_plugins_PluginsSettings_18",
    defaultMessage: "Settings are provided by active plugins. Changes, including restored defaults, apply when saved.",
  },
  noSettings: {
    id: "features_plugins_PluginsSettings_19",
    defaultMessage: "No plugin settings",
  },
  noSettingsHint: {
    id: "features_plugins_PluginsSettings_20",
    defaultMessage: "Active plugins have not declared any settings.",
  },
}));
