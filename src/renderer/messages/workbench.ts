import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const workbenchMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  layout: { id: "workbench.layout", defaultMessage: "Layout" },
  arrange: { id: "workbench.arrange", defaultMessage: "Arrange" },
  arranging: { id: "workbench.arranging", defaultMessage: "Arranging…" },
  arrangeFailed: { id: "workbench.arrangeFailed", defaultMessage: "Unable to arrange the cards. Try again." },
  emptyHint: {
    id: "features_workbench_Workbench_1",
    defaultMessage: "Use Add, or drop content here.",
  },
  dropHint: {
    id: "features_workbench_Workbench_2",
    defaultMessage: "Drop to add as resources",
  },
  syncing: {
    id: "workbench.syncing",
    defaultMessage: "Syncing workbench…",
  },
  connecting: {
    id: "workbench.connecting",
    defaultMessage: "Connecting to workbench…",
  },
  serviceUnavailable: {
    id: "workbench.serviceUnavailable",
    defaultMessage: "Task service unavailable",
  },
  loadFailed: {
    id: "workbench.loadFailed",
    defaultMessage: "Unable to load workbench",
  },
  updateFailed: {
    id: "workbench.updateFailed",
    defaultMessage: "Unable to update workbench",
  },
  staleContent: {
    id: "workbench.staleContent",
    defaultMessage: "Showing the last available content. Try again to resume making changes.",
  },
}));
