import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const creationMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  workbenchNotReady: {
    id: "features_creation_coordinator_1",
    defaultMessage: "The workbench is not ready. Try again.",
  },
  adding: {
    id: "features_creation_coordinator_2",
    defaultMessage: "Adding {running_label}…",
  },
  text: {
    id: "features_creation_coordinator_3",
    defaultMessage: "Text",
  },
  addAs: {
    id: "features_creation_coordinator_4",
    defaultMessage: "Add as…",
  },
  rememberType: {
    id: "features_creation_coordinator_5",
    defaultMessage: "Remember for this type",
  },
}));
