import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const turnMetricMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  cache: { id: "turnMetrics.cache", defaultMessage: "Cache hit rate" },
  throughput: { id: "turnMetrics.throughput", defaultMessage: "Output throughput · E2E" },
  turn: { id: "turnMetrics.turn", defaultMessage: "This turn" },
  requests: { id: "turnMetrics.requests", defaultMessage: "{count, plural, one {# model request} other {# model requests}}" },
  coverage: { id: "turnMetrics.coverage", defaultMessage: "{count} of {total} requests reported" },
  cacheBasis: { id: "turnMetrics.cacheBasis", defaultMessage: "{read} cached / {input} input toks" },
  cacheHint: { id: "turnMetrics.cacheHint", defaultMessage: "Total cached input ÷ total input across requests with both values reported." },
  throughputHint: { id: "turnMetrics.throughputHint", defaultMessage: "Total output tokens ÷ their total request time, including model waiting and reasoning. Tool execution is excluded." },
  incomplete: { id: "turnMetrics.incomplete", defaultMessage: "This turn is incomplete. Showing reported measurements." },
  tps: { id: "turnMetrics.tps", defaultMessage: "{value} t/s" },
}));
