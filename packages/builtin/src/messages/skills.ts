import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const skillsMessages = builtin.messages("en", defineMessages({
  title: { id: "skills.title", defaultMessage: "Skills" },
  loading: { id: "skills.loading", defaultMessage: "Loading skills…" },
  empty: { id: "skills.empty", defaultMessage: "No skills found." },
  failed: { id: "skills.failed", defaultMessage: "Skills could not be loaded." },
  issues: { id: "skills.issues", defaultMessage: "Some skills could not be loaded." },
  refresh: { id: "skills.refresh", defaultMessage: "Refresh skills" },
  count: { id: "skills.count", defaultMessage: "{count, plural, one {# skill} other {# skills}}" },
  read: { id: "skills.read", defaultMessage: "Read skill" },
}));
