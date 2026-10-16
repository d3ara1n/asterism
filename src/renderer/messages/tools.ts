import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const toolsMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  toolPreparing: {
    id: "toolPreparing",
    defaultMessage: "Preparing resource operation…",
  },
  toolPreparingList: {
    id: "toolPreparingList",
    defaultMessage: "Preparing to list resources…",
  },
  toolPreparingInspect: {
    id: "toolPreparingInspect",
    defaultMessage: "Preparing to inspect a resource…",
  },
  toolResourceList: {
    id: "toolResourceList",
    defaultMessage: "Available resources",
  },
  toolResourceInspect: {
    id: "toolResourceInspect",
    defaultMessage: "Inspect resource",
  },
  toolResourceCall: {
    id: "toolResourceCall",
    defaultMessage: "Resource operation",
  },
  toolResourceCount: {
    id: "toolResourceCount",
    defaultMessage: "{count, plural, one {# resource} other {# resources}}",
  },
  toolNoResources: {
    id: "toolNoResources",
    defaultMessage: "No resources are currently linked.",
  },
  toolResourceState: {
    id: "toolResourceState",
    defaultMessage: "Resource state",
  },
  toolAvailableTools: {
    id: "toolAvailableTools",
    defaultMessage: "Available tools",
  },
  toolNoTools: {
    id: "toolNoTools",
    defaultMessage: "No tools are available for this resource.",
  },
  toolUsageDetails: {
    id: "toolUsageDetails",
    defaultMessage: "Usage and parameters",
  },
  toolArguments: {
    id: "toolArguments",
    defaultMessage: "Arguments",
  },
  toolTarget: {
    id: "toolTarget",
    defaultMessage: "Target",
  },
  toolResultSchema: {
    id: "toolResultSchema",
    defaultMessage: "Result schema",
  },
}));
