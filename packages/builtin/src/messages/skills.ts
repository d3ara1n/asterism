import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const skillsMessages = builtin.messages("en", defineMessages({
  refresh: { id: "skills.refresh", defaultMessage: "Refresh skills" },
  count: { id: "skills.count", defaultMessage: "{count, plural, one {# skill} other {# skills}}" },
  read: { id: "skills.read", defaultMessage: "Read skill" },
}));
