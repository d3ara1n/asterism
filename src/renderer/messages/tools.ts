import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const toolsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
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
  toolPreparingScript: {
    id: "toolPreparingScript",
    defaultMessage: "Preparing resource orchestration…",
  },
  toolResourceScript: {
    id: "toolResourceScript",
    defaultMessage: "Resource orchestration",
  },
  toolScriptQueued: {
    id: "toolScriptQueued",
    defaultMessage: "Queued",
  },
  toolScriptRunning: {
    id: "toolScriptRunning",
    defaultMessage: "Running",
  },
  toolScriptElapsed: {
    id: "toolScriptElapsed",
    defaultMessage: "{seconds}s",
  },
  toolScriptCalls: {
    id: "toolScriptCalls",
    defaultMessage: "{count, plural, one {# call} other {# calls}}",
  },
  toolScriptFailedCount: {
    id: "toolScriptFailedCount",
    defaultMessage: "{count} failed",
  },
  toolScriptPartialCount: {
    id: "toolScriptPartialCount",
    defaultMessage: "{count} partial",
  },
  toolScriptCode: {
    id: "toolScriptCode",
    defaultMessage: "Code",
  },
  toolScriptValue: {
    id: "toolScriptValue",
    defaultMessage: "Return value",
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
  toolRequiresInteraction: {
    id: "toolRequiresInteraction",
    defaultMessage: "User interaction",
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
}));
