import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const workbenchMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  emptyHint: {
    id: "features_workbench_Workbench_1",
    defaultMessage: "Use Add, or drop content here.",
  },
  dropHint: {
    id: "features_workbench_Workbench_2",
    defaultMessage: "Drop to add as resources",
  },
}));
