import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const toolsMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  toolWaiting: {
    id: "toolWaiting",
    defaultMessage: "Waiting",
  },
  toolIncomplete: {
    id: "toolIncomplete",
    defaultMessage: "Not executed",
  },
  toolIncompleteRequest: {
    id: "toolIncompleteRequest",
    defaultMessage: "Incomplete resource request",
  },
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
