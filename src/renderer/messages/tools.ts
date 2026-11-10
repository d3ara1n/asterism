import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const toolsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  toolPreparing: {
    id: "tools.resources.call.preparing",
    defaultMessage: "Preparing resource operation…",
  },
  toolPreparingList: {
    id: "tools.resources.list.preparing",
    defaultMessage: "Preparing to list resources…",
  },
  toolPreparingInspect: {
    id: "tools.resources.inspect.preparing",
    defaultMessage: "Preparing to inspect a resource…",
  },
  toolPreparingScript: {
    id: "tools.resources.script.preparing",
    defaultMessage: "Preparing resource orchestration…",
  },
  toolResourceScript: {
    id: "tools.resources.script",
    defaultMessage: "Orchestrate resources",
  },
  toolScriptQueued: {
    id: "tools.script.queued",
    defaultMessage: "Queued",
  },
  toolScriptRunning: {
    id: "tools.script.running",
    defaultMessage: "Running",
  },
  toolScriptElapsed: {
    id: "tools.script.elapsed",
    defaultMessage: "{seconds}s",
  },
  toolScriptCalls: {
    id: "tools.script.calls",
    defaultMessage: "{count, plural, one {# call} other {# calls}}",
  },
  toolScriptFailedCount: {
    id: "tools.script.failedCount",
    defaultMessage: "{count} failed",
  },
  toolScriptPartialCount: {
    id: "tools.script.partialCount",
    defaultMessage: "{count} partial",
  },
  toolScriptCode: {
    id: "tools.script.code",
    defaultMessage: "Code",
  },
  toolScriptLogs: {
    id: "tools.script.logs",
    defaultMessage: "Logs",
  },
  toolScriptValue: {
    id: "tools.script.returnValue",
    defaultMessage: "Return value",
  },
  toolResourceList: {
    id: "tools.resources.list",
    defaultMessage: "List resources",
  },
  toolResourceInspect: {
    id: "tools.resources.inspect",
    defaultMessage: "Inspect resource",
  },
  toolResourceCall: {
    id: "tools.resources.call",
    defaultMessage: "Operate resource",
  },
  toolResourceCount: {
    id: "tools.resources.count",
    defaultMessage: "{count, plural, one {# resource} other {# resources}}",
  },
  toolNoResources: {
    id: "tools.resources.empty",
    defaultMessage: "No resources are currently linked.",
  },
  toolResourceState: {
    id: "tools.resources.state",
    defaultMessage: "Resource state",
  },
  toolAvailableTools: {
    id: "tools.resources.availableTools",
    defaultMessage: "Available tools",
  },
  toolRequiresInteraction: {
    id: "tools.requiresInteraction",
    defaultMessage: "User interaction",
  },
  toolNoTools: {
    id: "tools.resources.noTools",
    defaultMessage: "No tools are available for this resource.",
  },
  toolUsageDetails: {
    id: "tools.usageDetails",
    defaultMessage: "Usage and parameters",
  },
  toolArguments: {
    id: "tools.arguments",
    defaultMessage: "Arguments",
  },
  toolTarget: {
    id: "tools.target",
    defaultMessage: "Target",
  },
  toolResultSchema: {
    id: "tools.resultSchema",
    defaultMessage: "Result schema",
  },
}));
