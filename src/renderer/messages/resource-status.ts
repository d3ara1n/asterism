import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const resourceStatusMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  running: { id: "resourceStatus.running", defaultMessage: "Running" },
  instanceSummary: { id: "resourceStatus.instanceSummary", defaultMessage: "Open · {count, plural, one {# resource} other {# resources}}" },
  instanceOpen: { id: "resourceStatus.instanceOpen", defaultMessage: "Open" },
  error: { id: "resourceStatus.error", defaultMessage: "Error" },
  attention: { id: "resourceStatus.attention", defaultMessage: "Needs your attention" },
  success: { id: "resourceStatus.success", defaultMessage: "Completed" },
  activitiesFailed: { id: "resourceStatus.activitiesFailed", defaultMessage: "Resource activity is unavailable." },
}));
