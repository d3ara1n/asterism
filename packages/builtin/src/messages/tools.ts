import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const toolsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  toolSucceeded: {
    id: "toolSucceeded",
    defaultMessage: "Completed",
  },
  toolPartial: {
    id: "toolPartial",
    defaultMessage: "Partially completed",
  },
  toolFailed: {
    id: "toolFailed",
    defaultMessage: "Failed",
  },
  toolRejected: {
    id: "toolRejected",
    defaultMessage: "Rejected",
  },
  toolCancelled: {
    id: "toolCancelled",
    defaultMessage: "Cancelled",
  },
  toolUnknown: {
    id: "toolUnknown",
    defaultMessage: "Outcome unknown",
  },
  toolCallDetails: {
    id: "toolCallDetails",
    defaultMessage: "Call details",
  },
  toolResultDetails: {
    id: "toolResultDetails",
    defaultMessage: "Result details",
  },
  toolNoOutput: {
    id: "toolNoOutput",
    defaultMessage: "No output was produced.",
  },
}));
