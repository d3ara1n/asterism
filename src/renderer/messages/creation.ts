import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const creationMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  workbenchNotReady: {
    id: "creation.workbenchNotReady",
    defaultMessage: "The workbench is not ready. Try again.",
  },
  adding: {
    id: "creation.adding",
    defaultMessage: "Adding {running_label}…",
  },
  text: {
    id: "creation.input.text",
    defaultMessage: "Text",
  },
  addAs: {
    id: "creation.typeChoice.title",
    defaultMessage: "Add as…",
  },
  rememberType: {
    id: "creation.typeChoice.remember",
    defaultMessage: "Remember for this type",
  },
}));
