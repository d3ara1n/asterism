import { DatabaseZap, Gauge } from "lucide-react";
import { useI18n, type I18n } from "@asterism-app/sdk/renderer";
import { formatCount } from "@asterism-app/ui/format-count";
import { Separator } from "@asterism-app/ui/ui/separator";
import { diagnosticMessages } from "../../messages/diagnostics";
import { performanceMessages } from "../../messages/performance";
import { turnMetricMessages as messages } from "../../messages/turn-metrics";
import { conversationMessages } from "../../messages/conversation";
import { percent, Stat, Stats } from "../panel-kit";
import { rateKeys, tokensPerSecond } from "../diagnostics/performance";
import { formatDuration } from "../diagnostics/format";
import { MetricTooltip } from "./MetricTooltip";
import { usageFields, type TurnMetricsData } from "./turn-metrics";

const throughput = (i18n: I18n, value: number | null) => value === null ? "—"
  : i18n.formatMessage(messages.tps, { value: i18n.formatNumber(value, { maximumFractionDigits: 1 }) });
const count = (value: number | null) => value === null ? "—" : formatCount(value);

/** Read-only summary for each settled turn; usage belongs in cache details, while duration and rates belong in throughput details. */
export function TurnMetrics({ metrics, incomplete }: { metrics: TurnMetricsData; incomplete: boolean }) {
  const i18n = useI18n();
  const title = i18n.text(messages.turn);
  const coverage = (reported: number) => reported < metrics.count
    ? i18n.formatMessage(messages.coverage, { count: reported, total: metrics.count }) : undefined;
  const hit = metrics.cache ? percent(i18n, metrics.cache.read, metrics.cache.input, 1) : "—";
  const output = metrics.performance.rates.output;
  const speed = throughput(i18n, tokensPerSecond(output));
  const header = <div className="space-y-1">
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="type-label">{title}</h4>
      <span className="type-caption">{i18n.formatMessage(messages.requests, { count: metrics.count })}</span>
    </div>
    {incomplete && <p className="type-caption">{i18n.text(messages.incomplete)}</p>}
  </div>;
  return <div className="-ml-1.5 flex flex-wrap items-center gap-1" aria-label={title}>
    <MetricTooltip label={`${title} · ${i18n.text(messages.cache)}`} icon={<DatabaseZap />} value={hit}>
      {header}
      <Stats>
        <Stat label={i18n.text(diagnosticMessages.cacheHit)} value={hit} caption={coverage(metrics.cache?.count ?? 0)} />
        <Stat label={i18n.text(diagnosticMessages.requests)} value={i18n.formatNumber(metrics.count)} />
      </Stats>
      <Separator />
      <Stats>{usageFields.map(field => <Stat key={field} label={i18n.text(diagnosticMessages[field])}
        value={count(metrics.usage[field].value)} caption={coverage(metrics.usage[field].count)} />)}</Stats>
      <div className="space-y-1">
        {metrics.cache && <p className="type-caption tabular-nums">{i18n.formatMessage(messages.cacheBasis, {
          read: formatCount(metrics.cache.read), input: formatCount(metrics.cache.input),
        })}</p>}
        <p className="type-caption">{i18n.text(messages.cacheHint)}</p>
      </div>
    </MetricTooltip>
    <MetricTooltip label={`${title} · ${i18n.text(messages.throughput)}`} icon={<Gauge />} value={speed}>
      {header}
      <Stats>
        <Stat label={i18n.text(performanceMessages.output)} value={speed} caption={coverage(output.count)} />
        <Stat label={i18n.text(performanceMessages.totalDuration)} value={formatDuration(i18n, metrics.performance.timed ? metrics.performance.durationMs : null)}
          caption={coverage(metrics.performance.timed)} />
        {rateKeys.filter(key => key !== "output").map(key => <Stat key={key}
          label={i18n.text(performanceMessages[key])} value={throughput(i18n, tokensPerSecond(metrics.performance.rates[key]))}
          caption={coverage(metrics.performance.rates[key].count)} />)}
      </Stats>
      <p className="type-caption">{i18n.text(messages.throughputHint)}</p>
    </MetricTooltip>
    {metrics.performance.timed > 0 && <span className="type-caption tabular-nums" title={i18n.text(performanceMessages.totalDurationHint)}>
      {formatDuration(i18n, metrics.performance.durationMs)}
    </span>}
    {incomplete && <span className="type-caption">{i18n.text(conversationMessages.incomplete)}</span>}
  </div>;
}
