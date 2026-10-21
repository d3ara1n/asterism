import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const resourceMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  agents: { id: "resources.agentList", defaultMessage: "List agent configurations" },
  agentCount: { id: "resources.agentCount", defaultMessage: "{count, plural, one {# agent} other {# agents}}" },
  noAgents: { id: "resources.noAgents", defaultMessage: "No agent configurations are available." },
  agentId: { id: "resources.agentId", defaultMessage: "Agent configuration ID" },
  examples: { id: "resources.agentExamples", defaultMessage: "Task examples" },
  list: { id: "resources.creationList", defaultMessage: "List creation entries" },
  inspect: { id: "resources.creationInspect", defaultMessage: "Inspect creation entry" },
  create: { id: "resources.create", defaultMessage: "Create resource" },
  remove: { id: "resources.remove", defaultMessage: "Remove resource" },
  count: { id: "resources.creationCount", defaultMessage: "{count, plural, one {# entry} other {# entries}}" },
  empty: { id: "resources.noCreations", defaultMessage: "No creation entries are available." },
  omitted: { id: "resources.creationsOmitted", defaultMessage: "{count, plural, one {# more entry in result details.} other {# more entries in result details.}}" },
  entry: { id: "resources.creationEntry", defaultMessage: "Creation entry" },
  kind: { id: "resources.kind", defaultMessage: "Resource type" },
  resourceId: { id: "resources.resourceId", defaultMessage: "Resource ID" },
  guidelines: { id: "resources.guidelines", defaultMessage: "Usage guidelines" },
  inputSchema: { id: "resources.inputSchema", defaultMessage: "Input schema" },
  removed: { id: "resources.removed", defaultMessage: "Removed from the session and all its links detached. History is preserved." },
}));
