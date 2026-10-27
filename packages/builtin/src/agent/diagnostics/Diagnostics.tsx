import { ArrowLeft, FileText, MessagesSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n, type I18n } from "@asterism-app/sdk/renderer";
import type { UiMessage, Usage, CostIssue } from "@asterism-app/sdk/contracts";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { Button } from "@asterism-app/ui/ui/button";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asterism-app/ui/ui/tabs";
import { formatCount } from "@asterism-app/ui/format-count";
import { diagnosticMessages as messages } from "../../messages/diagnostics";
import { ConversationTimeline } from "../conversation/ConversationTimeline";
import { savedTimelineBlock, type TimelineItem } from "../conversation/timeline";
import { PanelBody, percent, Section, Stat, Stats, SystemComposition } from "../panel-kit";
import { useDiagnostics, type PricedRequest } from "./use-diagnostics";
import type { DiagnosticScope } from "./history";
import type { DiagnosticOverview } from "./overview";
import { InputTrend } from "./InputTrend";
import { formatEstimate, formatMoney, formatPrice, formatQuantity, formatDuration } from "./format";
import { RequestPerformance, PerformanceOverview } from "./PerformanceMetrics";
import { requestTiming } from "./performance";

const issueMessages: Record<CostIssue, UiMessage> = {
  quantity: messages.quantityMissing, price: messages.priceMissing, unit: messages.unitMismatch,
  tier: messages.tierUnknown, invalid: messages.invalidQuantity,
};
function requestState(request: PricedRequest): { label: UiMessage; tone: StatusTone } {
  const outcome = requestTiming(request)?.outcome;
  if (outcome === "cancelled") return { label: messages.cancelled, tone: "neutral" };
  if (outcome === "failed") return { label: messages.failed, tone: "error" };
  if (!request.completion) return { label: messages.noCompletion, tone: "neutral" };
  const complete = ["stop", "tool-calls"].includes(request.completion.finishReason)
    && request.blocks.every(({ block }) => block.complete)
    && (!request.blocks.length || request.blocks.at(-1)!.block.ordinal + 1 === request.blocks.length);
  return complete ? { label: messages.finished, tone: "success" } : { label: messages.incomplete, tone: "warning" };
}
const cacheRate = (i18n: I18n, usage: Usage | null) =>
  usage?.input != null && usage.cacheRead != null ? percent(i18n, usage.cacheRead, usage.input) : "—";

function RequestDetails({ request, onBack }: { request: PricedRequest; onBack(): void }) {
  const i18n = useI18n();
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  const usage = request.completion?.usage ?? null;
  const estimate = request.estimate;
  const status = requestState(request);
  let pricingLabel = i18n.text(messages.basePrice);
  if (!request.configuredModel?.cost) pricingLabel = i18n.text(messages.priceMissing);
  else if (estimate.lines.some(line => line.issue === "tier")) pricingLabel = i18n.text(messages.tierUnknown);
  else if (estimate.fromInputTokens !== null) pricingLabel = i18n.formatMessage(messages.tier, { count: formatCount(estimate.fromInputTokens) });
  const content: TimelineItem[] = [];
  if (request.relatedInput) content.push({ kind: "message", ...request.relatedInput });
  content.push(...request.blocks.map(({ record, block }) => savedTimelineBlock(record, block)));
  if (request.summary) content.push({ kind: "summary", id: request.id, text: request.summary });
  const metadata: [UiMessage, string][] = [
    [messages.model, request.model],
    [messages.recordedAt, i18n.formatDate(Date.parse(request.createdAt), { dateStyle: "short", timeStyle: "medium" })],
  ];
  if (request.completion) metadata.push([messages.finishReason, [request.completion.finishReason, request.completion.rawFinishReason].filter(Boolean).join(" / ")]);
  if (request.responseId) metadata.push([messages.responseId, request.responseId]);
  if (request.requestParentId) metadata.push([messages.requestParent, request.requestParentId]);
  if (request.completion?.providerResponseId) metadata.push([messages.providerResponseId, request.completion.providerResponseId]);
  const count = (value: number | null | undefined) => value == null ? "—" : formatCount(value);
  return <>
    <div className="space-y-3">
      <Button ref={back} variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ArrowLeft />{i18n.text(messages.back)}</Button>
      <div className="space-y-2">
        <h4 className="type-section break-all">{request.configuredModel?.name ?? request.model}</h4>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{i18n.text(request.kind === "compression" ? messages.compression : messages.conversation)}</Badge>
          <StatusBadge tone={status.tone}>{i18n.text(status.label)}</StatusBadge>
          {!request.onTimeline && <Badge variant="outline">{i18n.text(messages.otherBranch)}</Badge>}
        </div>
      </div>
      <dl className="space-y-2">{metadata.map(([label, value]) => <div key={label.id}>
        <dt className="type-caption">{i18n.text(label)}</dt><dd className="type-caption text-foreground select-text break-all">{value}</dd>
      </div>)}</dl>
    </div>
    <Section title={i18n.text(messages.usage)}>
      <Stats columns={3}>
        <Stat label={i18n.text(messages.input)} value={count(usage?.input)} />
        <Stat label={i18n.text(messages.output)} value={count(usage?.output)} />
        <Stat label={i18n.text(messages.cacheHit)} value={cacheRate(i18n, usage)} />
        <Stat label={i18n.text(messages.cacheRead)} value={count(usage?.cacheRead)} />
        <Stat label={i18n.text(messages.cacheWrite)} value={count(usage?.cacheWrite)} />
        <Stat label={i18n.text(messages.reasoning)} value={count(usage?.reasoning)} />
      </Stats>
    </Section>
    <RequestPerformance request={request} />
    {request.kind === "response" && <Section title={i18n.text(messages.composition)}>
      {request.sent ? <SystemComposition diagnostics={request.sent} /> : <p className="type-caption">{i18n.text(messages.compositionMissing)}</p>}
    </Section>}
    <Section title={i18n.text(messages.pricing)} aside={formatEstimate(i18n, estimate.amount, estimate.status === "partial")}>
      <ul className="space-y-2.5">{estimate.lines.map(line => <li key={`${line.modality}/${line.item}`} className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-3"><span className="type-body">{i18n.text(messages[line.item])}</span>
          <span className="type-body tabular-nums">{line.amount === null ? "—" : formatMoney(i18n, line.amount)}</span></div>
        <p className="type-caption tabular-nums">{line.quantity === null ? "—" : formatQuantity(i18n, line.quantity, line.unit)} {i18n.text(messages[line.unit])}
          {line.price && <> · {formatPrice(i18n, line.price)}</>}</p>
        {line.issue && <p className="type-caption">{i18n.text(issueMessages[line.issue])}</p>}
      </li>)}</ul>
      <div className="space-y-1">
        <p className="type-caption">{pricingLabel}</p>
        {request.inputHasFiles !== false && <p className="type-caption">{i18n.text(messages.inputNotText)}</p>}
        {!estimate.lines.some(line => line.item === "reasoning") && <p className="type-caption">{i18n.text(messages.reasoningIncluded)}</p>}
      </div>
    </Section>
    <Section title={i18n.text(messages.contents)}>
      {content.length > 0 ? <div className="space-y-4"><ConversationTimeline items={content} /></div> : <p className="type-caption">{i18n.text(messages.noContent)}</p>}
    </Section>
  </>;
}

function Headroom({ headroom }: { headroom: DiagnosticOverview["headroom"] }) {
  const i18n = useI18n();
  if (headroom === null) return null;
  const label = i18n.text(messages.headroom);
  if (headroom === "compressed") return <Stat label={label} value="—" caption={i18n.text(messages.headroomCompressed)} />;
  if (headroom === "unknown") return <Stat label={label} value="—" caption={i18n.text(messages.headroomUnknown)} />;
  return <Stat label={label} value={headroom.remaining > 0 ? formatCount(headroom.remaining) : i18n.text(messages.headroomOver)}
    caption={i18n.formatMessage(messages.headroomCaption, { threshold: formatCount(headroom.threshold) })} />;
}

function Overview({ data, scope }: { data: ReturnType<typeof useDiagnostics>; scope: DiagnosticScope }) {
  const i18n = useI18n();
  const { cache, trend, compressions, headroom } = data.overview;
  const path = scope === "timeline";
  return <>
    <Section title={i18n.text(messages.overview)}>
      <Stats>
        <Stat label={i18n.text(messages.referenceCost)}
          value={formatEstimate(i18n, data.total.amount, data.total.incomplete > 0 || data.unreadable > 0)} />
        <Stat label={i18n.text(messages.requests)} value={i18n.formatNumber(data.requests.length)} />
        <Stat label={i18n.text(messages.cacheHit)} value={cache ? percent(i18n, cache.read, cache.input) : "—"}
          caption={cache ? i18n.formatMessage(messages.cacheHitCaption, { read: formatCount(cache.read), input: formatCount(cache.input) }) : undefined} />
        {path ? <Headroom headroom={headroom} />
          : <Stat label={i18n.text(messages.compressionCount)} value={i18n.formatNumber(compressions.length)} />}
      </Stats>
      <div className="space-y-1">
        <p className="type-caption">{i18n.text(messages.currentPrices)}</p>
        {data.total.incomplete > 0 && <p className="type-caption">{i18n.formatMessage(messages.incompleteCount, { count: data.total.incomplete })}</p>}
        {data.unreadable > 0 && <p className="type-caption">{i18n.formatMessage(messages.unreadable, { count: data.unreadable })}</p>}
      </div>
    </Section>
    <PerformanceOverview requests={data.requests} />
    {path && trend.length > 0 && <Section title={i18n.text(messages.trend)}>
      {trend.length > 1 ? <>
        <InputTrend points={trend} compressions={compressions} threshold={typeof headroom === "object" && headroom ? headroom.threshold : null} />
        <p className="type-caption">{i18n.text(messages.trendHint)}</p>
      </> : <p className="type-caption">{i18n.text(messages.trendSingle)}</p>}
    </Section>}
    {path && compressions.length > 0 && <Section title={i18n.text(messages.compressions)} aside={i18n.formatNumber(compressions.length)}>
      <ul className="space-y-1.5">{[...compressions].reverse().map(entry => {
        const before = entry.tokensBefore === null ? "—" : formatCount(entry.tokensBefore);
        return <li key={entry.id} className="flex items-baseline justify-between gap-3">
          <span className="type-body tabular-nums">{entry.after === null ? i18n.formatMessage(messages.compressionPending, { before })
            : i18n.formatMessage(messages.compressionRow, { before, after: formatCount(entry.after) })}</span>
          <span className="type-caption shrink-0 tabular-nums">{i18n.formatDate(Date.parse(entry.createdAt), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </li>;
      })}</ul>
      <p className="type-caption">{i18n.text(messages.compressionHint)}</p>
    </Section>}
  </>;
}

export function Diagnostics() {
  const i18n = useI18n();
  const [scope, setScope] = useState<DiagnosticScope>("timeline");
  const [selection, setSelection] = useState<string | null>(null);
  const listHeading = useRef<HTMLDivElement>(null);
  const restoreListFocus = useRef(false);
  const data = useDiagnostics(scope);
  const selected = data.requests.find(request => request.id === selection);
  useEffect(() => {
    if (!selected && restoreListFocus.current) {
      restoreListFocus.current = false;
      listHeading.current?.focus({ preventScroll: true });
    }
  }, [selected]);
  const body = selected ? <RequestDetails request={selected} onBack={() => { restoreListFocus.current = true; setSelection(null); }} /> : <>
    <div ref={listHeading} tabIndex={-1} className="space-y-6 outline-none"><Overview data={data} scope={scope} /></div>
    <Section title={i18n.text(messages.requests)}>
      {!data.requests.length ? <p className="type-caption">{i18n.text(messages.noRequests)}</p>
        : <ItemGroup className="-mx-1">{data.requests.map((request, index) => <div key={request.id}>
          {index > 0 && <ItemSeparator />}
          <ListRow className="px-1" title={<span className="break-all">{request.configuredModel?.name ?? request.model}</span>}
            description={<>{i18n.text(request.kind === "compression" ? messages.compression : messages.conversation)} · {i18n.formatDate(Date.parse(request.createdAt), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
            media={request.kind === "compression" ? <FileText className="size-4" /> : <MessagesSquare className="size-4" />}
            actions={<span className="flex flex-col items-end gap-0.5 text-right">
              <span className="type-caption max-w-24 break-words tabular-nums">{formatEstimate(i18n, request.estimate.amount, request.estimate.status === "partial")}</span>
              {request.completion?.usage?.input != null && <span className="type-caption tabular-nums">{formatCount(request.completion.usage.input)}</span>}
              {requestTiming(request) && <span className="type-caption tabular-nums">{formatDuration(i18n, requestTiming(request)!.durationMs)}</span>}
            </span>}
            onOpen={() => setSelection(request.id)} />
        </div>)}</ItemGroup>}
    </Section>
  </>;
  return <Tabs className="flex min-h-0 min-w-0 flex-1 flex-col gap-0" value={scope}
    onValueChange={value => { if (value === "timeline" || value === "session") { setScope(value); setSelection(null); } }}>
    <div className="shrink-0 px-3 pt-3">
      {data.error && <Alert variant="destructive" className="mb-3"><AlertDescription>{i18n.text(data.error)}</AlertDescription></Alert>}
      <TabsList className="w-full" aria-label={i18n.text(messages.scope)}>
        <TabsTrigger value="timeline">{i18n.text(messages.currentPath)}</TabsTrigger><TabsTrigger value="session">{i18n.text(messages.allBranches)}</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent key={`${scope}:${selection ?? ""}`} value={scope} className="flex min-h-0 flex-1 flex-col">
      <PanelBody>{body}</PanelBody>
    </TabsContent>
  </Tabs>;
}
