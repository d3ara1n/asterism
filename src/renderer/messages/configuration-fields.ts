import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

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
    id: "configurationFields.notSet",
    defaultMessage: "Not set",
  },
  invalidJson: {
    id: "configurationFields.invalidJson",
    defaultMessage: "Enter a valid JSON value.",
  },
  leaveUnset: {
    id: "configurationFields.leaveUnset",
    defaultMessage: "Leave unset",
  },
  selectValue: {
    id: "configurationFields.selectValue",
    defaultMessage: "Select a value",
  },
}));
