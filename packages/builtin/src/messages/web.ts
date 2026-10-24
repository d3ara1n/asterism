import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const webMessages = builtin.messages("en", defineMessages({
  title: { id: "web.title", defaultMessage: "Web" },
  search: { id: "web.search", defaultMessage: "Search web" },
  fetch: { id: "web.fetch", defaultMessage: "Fetch URL" },
  empty: { id: "web.empty", defaultMessage: "Add a web provider in Settings → Providers." },
  noResults: { id: "web.noResults", defaultMessage: "No results." },
  disabled: { id: "web.disabled", defaultMessage: "Disabled" },
  unavailable: { id: "web.unavailable", defaultMessage: "Provider unavailable" },
  truncated: { id: "web.truncated", defaultMessage: "Truncated" },
  results: { id: "web.results", defaultMessage: "{count, plural, one {# result} other {# results}}" },
}));
