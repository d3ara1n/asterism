import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const resourceStatusMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "resourceStatus.title", defaultMessage: "Resource status" },
  summary: { id: "resourceStatus.summary", defaultMessage: "{status} · {count, plural, one {# resource} other {# resources}}" },
  running: { id: "resourceStatus.running", defaultMessage: "Running" },
  failed: { id: "resourceStatus.failed", defaultMessage: "Failed" },
  awaiting: { id: "resourceStatus.awaiting", defaultMessage: "Needs your attention" },
  completed: { id: "resourceStatus.completed", defaultMessage: "Completed" },
}));
