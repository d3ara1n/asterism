import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const resourceMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
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
  created: { id: "resources.created", defaultMessage: "Created and linked to this agent." },
  removed: { id: "resources.removed", defaultMessage: "Removed from the session and all its links detached. History is preserved." },
}));
