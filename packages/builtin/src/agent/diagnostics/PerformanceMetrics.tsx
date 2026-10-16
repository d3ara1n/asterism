import { Info } from "lucide-react";
import { useI18n, type I18n } from "@atelier/sdk/renderer";
import type { UiMessage } from "@atelier/sdk/contracts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@atelier/ui/ui/tooltip";
import { performanceMessages as messages } from "../../messages/performance";
import { Section, Stat, Stats } from "../panel-kit";
import type { DiagnosticRequest } from "./history";
import { outputDuration, performanceOverview, rateKeys, rateSamples, requestTiming, tokensPerSecond } from "./performance";
import { formatDuration } from "./format";

const formatRate = (i18n: I18n, rate: number | null) => rate === null ? "—"
  : i18n.formatMessage(messages.tps, { value: i18n.formatNumber(rate, { maximumFractionDigits: 2 }) });

function Metric({ label, hint, value, caption }: { label: UiMessage; hint: UiMessage; value: string; caption?: string }) {
  const i18n = useI18n();
  return <Stat label={<Tooltip>
    <TooltipTrigger asChild><span tabIndex={0} className="inline-flex max-w-full items-center gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>{i18n.text(label)}</span><Info className="size-3 shrink-0" aria-hidden="true" />
    </span></TooltipTrigger>
    <TooltipContent className="max-w-64">{i18n.text(hint)}</TooltipContent>
  </Tooltip>} value={value} caption={caption} />;
}

export function RequestPerformance({ request }: { request: DiagnosticRequest }) {
  const i18n = useI18n();
  const timing = requestTiming(request);
  const samples = rateSamples(timing, request.completion?.usage ?? null);
  return <>
    <Section title={i18n.text(messages.timing)}>
      {timing ? <>
        <dl className="space-y-2">
          {([[messages.startedAt, timing.startedAt], [messages.endedAt, timing.endedAt]] as const).map(([label, value]) =>
            <div key={label.id}><dt className="type-caption">{i18n.text(label)}</dt>
              <dd className="type-caption text-foreground select-text tabular-nums">{i18n.formatDate(Date.parse(value),
                { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}</dd></div>)}
        </dl>
        <Stats>
          <Metric label={messages.duration} hint={messages.durationHint} value={formatDuration(i18n, timing.durationMs)} />
          <Metric label={messages.firstOutput} hint={messages.firstOutputHint} value={formatDuration(i18n, timing.firstOutputMs)} />
          <Metric label={messages.firstText} hint={messages.firstTextHint} value={formatDuration(i18n, timing.firstTextMs)} />
          <Metric label={messages.outputDuration} hint={messages.outputDurationHint} value={formatDuration(i18n, outputDuration(timing))} />
        </Stats>
      </> : <p className="type-caption">{i18n.text(messages.missing)}</p>}
    </Section>
    <Section title={i18n.text(messages.rates)}>
      <Stats>{rateKeys.map(key => <Metric key={key} label={messages[key]} hint={messages[`${key}Hint`]}
        value={formatRate(i18n, tokensPerSecond(samples[key]))} />)}</Stats>
    </Section>
  </>;
}

export function PerformanceOverview({ requests }: { requests: readonly DiagnosticRequest[] }) {
  const i18n = useI18n();
  const overview = performanceOverview(requests);
  const count = (value: number) => i18n.formatMessage(messages.samples, { count: value });
  return <Section title={i18n.text(messages.performance)}>
    <Stats>
      <Metric label={messages.totalDuration} hint={messages.totalDurationHint}
        value={formatDuration(i18n, overview.timed ? overview.durationMs : null)} caption={count(overview.timed)} />
      {rateKeys.map(key => <Metric key={key} label={messages[key]} hint={messages[`${key}Hint`]}
        value={formatRate(i18n, tokensPerSecond(overview.rates[key]))} caption={count(overview.rates[key].count)} />)}
    </Stats>
    <p className="type-caption">{i18n.text(messages.aggregateHint)}</p>
  </Section>;
}
