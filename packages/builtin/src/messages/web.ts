import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const webMessages = builtin.messages("en", defineMessages({
  title: { id: "web.title", defaultMessage: "Web" },
  search: { id: "web.search", defaultMessage: "Search web" },
  fetch: { id: "web.fetch", defaultMessage: "Fetch URL" },
  empty: { id: "web.empty", defaultMessage: "No web provider is enabled. Add one in Settings → Providers." },
  noResults: { id: "web.noResults", defaultMessage: "No results." },
  truncated: { id: "web.truncated", defaultMessage: "Truncated" },
  searches: { id: "web.searches", defaultMessage: "Searches" },
  fetches: { id: "web.fetches", defaultMessage: "Fetches" },
  cost: { id: "web.cost", defaultMessage: "Cost" },
  failedCount: { id: "web.failedCount", defaultMessage: "{count} failed" },
  cancelledCount: { id: "web.cancelledCount", defaultMessage: "{count} cancelled" },
  inFlight: { id: "web.inFlight", defaultMessage: "{count} in progress" },
  noRequests: { id: "web.noRequests", defaultMessage: "No web requests in this session yet." },
  durations: { id: "web.durations", defaultMessage: "Average {average} · Last {last}" },
  recent: { id: "web.recent", defaultMessage: "Recent requests" },
  outcome: { id: "web.outcome", defaultMessage: "{outcome, select, succeeded {Succeeded} failed {Failed} other {Cancelled}}" },
  results: { id: "web.results", defaultMessage: "{count, plural, one {# result} other {# results}}" },
}));
