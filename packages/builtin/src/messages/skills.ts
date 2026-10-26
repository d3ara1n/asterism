import { defineMessages } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";

export const skillsMessages = builtin.messages("en", defineMessages({
  title: { id: "skills.title", defaultMessage: "Skills" },
  loading: { id: "skills.loading", defaultMessage: "Loading skills…" },
  empty: { id: "skills.empty", defaultMessage: "No skills found." },
  emptyHint: { id: "skills.emptyHint", defaultMessage: "Each skill is a subdirectory containing SKILL.md." },
  failed: { id: "skills.failed", defaultMessage: "Skills could not be loaded." },
  retry: { id: "skills.retry", defaultMessage: "Retry" },
  issues: { id: "skills.issues", defaultMessage: "Some skills could not be loaded." },
  issueCount: { id: "skills.issueCount", defaultMessage: "{count, plural, one {# issue} other {# issues}}" },
  refresh: { id: "skills.refresh", defaultMessage: "Refresh skills" },
  count: { id: "skills.count", defaultMessage: "{count, plural, one {# skill} other {# skills}}" },
  sourceSummary: { id: "skills.sourceSummary", defaultMessage: "{count, plural, one {# skill} other {# skills}}, {overridden, plural, =0 {none overridden} other {# overridden}}" },
  overriddenBy: { id: "skills.overriddenBy", defaultMessage: "Overridden by {source}" },
  overrideOrder: { id: "skills.overrideOrder", defaultMessage: "Skills with the same name from a later source override earlier ones." },
  search: { id: "skills.search", defaultMessage: "Search skills" },
  noMatch: { id: "skills.noMatch", defaultMessage: "No matching skills." },
  source: { id: "skills.source", defaultMessage: "Skill source" },
  sourceRemoved: { id: "skills.sourceRemoved", defaultMessage: "This source is no longer in the catalog." },
  read: { id: "skills.read", defaultMessage: "Read skill" },
}));
