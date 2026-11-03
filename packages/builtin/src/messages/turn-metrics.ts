import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const turnMetricMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  cache: { id: "turnMetrics.cache", defaultMessage: "Cache hit rate" },
  throughput: { id: "turnMetrics.throughput", defaultMessage: "Output throughput · E2E" },
  turn: { id: "turnMetrics.turn", defaultMessage: "This turn" },
  copyReply: { id: "turnMetrics.copyReply", defaultMessage: "Copy reply as Markdown" },
  copied: { id: "turnMetrics.copied", defaultMessage: "Copied" },
  copyFailed: { id: "turnMetrics.copyFailed", defaultMessage: "Could not copy the reply. Please try again." },
  requests: { id: "turnMetrics.requests", defaultMessage: "{count, plural, one {# model request} other {# model requests}}" },
  coverage: { id: "turnMetrics.coverage", defaultMessage: "{count} of {total} requests reported" },
  cacheBasis: { id: "turnMetrics.cacheBasis", defaultMessage: "{read} cached / {input} input toks" },
  tps: { id: "turnMetrics.tps", defaultMessage: "{value} t/s" },
}));
