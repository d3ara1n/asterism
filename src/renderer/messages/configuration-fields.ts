import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const configurationFieldMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  nullValue: {
    id: "configurationFields.nullValue",
    defaultMessage: "Explicit null",
  },
  customValue: {
    id: "configurationFields.customValue",
    defaultMessage: "Custom value",
  },
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
  selectValue: {
    id: "features_plugins_PluginConfigurations_5",
    defaultMessage: "Select a value",
  },
}));
