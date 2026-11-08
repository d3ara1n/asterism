import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const formsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  default: {
    id: "forms.values.default",
    defaultMessage: "Default",
  },
  useBuiltin: {
    id: "forms.values.useBuiltin",
    defaultMessage: "Use built-in",
  },
  unavailable: {
    id: "forms.values.unavailable",
    defaultMessage: "Unavailable",
  },
  builtin: {
    id: "forms.values.builtin",
    defaultMessage: "Built-in",
  },
  modified: {
    id: "forms.state.modified",
    defaultMessage: "Modified",
  },
  restore: {
    id: "forms.values.restore",
    defaultMessage: "Restore",
  },
  customList: {
    id: "forms.list.custom",
    defaultMessage: "Custom list",
  },
  items: {
    id: "forms.list.itemsLabel",
    defaultMessage: "Items (one per line)",
  },
  restoreAll: {
    id: "forms.restoreAll.label",
    defaultMessage: "Restore all built-in values",
  },
  restoreAllLabel: {
    id: "forms.restoreAll.tooltip",
    defaultMessage: "Restore all built-in values",
  },
  deleteLabel: {
    id: "forms.delete.label",
    defaultMessage: "Delete",
  },
  deleteButton: {
    id: "forms.delete.tooltip",
    defaultMessage: "Delete",
  },
  saving: {
    id: "forms.state.saving",
    defaultMessage: "Saving…",
  },
  save: {
    id: "forms.actions.save",
    defaultMessage: "Save",
  },
  cancel: {
    id: "forms.actions.cancel",
    defaultMessage: "Cancel",
  },
  delete: {
    id: "forms.delete.action",
    defaultMessage: "Delete",
  },
  discardTitle: {
    id: "forms.discard.title",
    defaultMessage: "Discard unsaved changes?",
  },
  discardDescription: {
    id: "forms.discard.description",
    defaultMessage: "Changes in “{title}” have not been saved.",
  },
  keepEditing: {
    id: "forms.discard.keepEditing",
    defaultMessage: "Keep editing",
  },
  discard: {
    id: "forms.discard.confirm",
    defaultMessage: "Discard",
  },
  reload: {
    id: "forms.actions.reload",
    defaultMessage: "Reload",
  },
  loading: {
    id: "forms.state.loading",
    defaultMessage: "Loading configuration…",
  },
}));
