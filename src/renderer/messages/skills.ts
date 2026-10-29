import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const skillsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
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
  composition: { id: "skills.composition", defaultMessage: "Each Agent paradigm selects and combines skills from these sources." },
  summary: { id: "skills.summary", defaultMessage: "Browse skill sources and refresh their contents." },
  search: { id: "skills.search", defaultMessage: "Search skills" },
  noMatch: { id: "skills.noMatch", defaultMessage: "No matching skills." },
  source: { id: "skills.source", defaultMessage: "Skill source" },
  sourceRemoved: { id: "skills.sourceRemoved", defaultMessage: "This source is no longer in the catalog." },
}));
