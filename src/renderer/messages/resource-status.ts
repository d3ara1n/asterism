import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const resourceStatusMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  activities: { id: "resourceStatus.activities", defaultMessage: "Activity" },
  notices: { id: "resourceStatus.notices", defaultMessage: "Notifications" },
  activitySummary: { id: "resourceStatus.activitySummary", defaultMessage: "Running · {count, plural, one {# activity} other {# activities}}" },
  instanceSummary: { id: "resourceStatus.instanceSummary", defaultMessage: "Open · {count, plural, one {# resource} other {# resources}}" },
  instanceHint: { id: "resourceStatus.instanceHint", defaultMessage: "{title} · Open" },
  instanceOpen: { id: "resourceStatus.instanceOpen", defaultMessage: "Open" },
  noticeSummary: { id: "resourceStatus.noticeSummary", defaultMessage: "{kind} · {count, plural, one {# notification} other {# notifications}}" },
  error: { id: "resourceStatus.error", defaultMessage: "Error" },
  attention: { id: "resourceStatus.attention", defaultMessage: "Needs your attention" },
  success: { id: "resourceStatus.success", defaultMessage: "Completed" },
  activitiesFailed: { id: "resourceStatus.activitiesFailed", defaultMessage: "Resource activity is unavailable." },
}));
