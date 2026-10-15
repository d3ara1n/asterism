import { ArrowLeft, FileText, MessagesSquare } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import type { UiMessage } from "@atelier/sdk/contracts";
import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";
import { Badge } from "../../../renderer/shared/ui/badge";
import { Button } from "../../../renderer/shared/ui/button";
import { ItemGroup, ItemSeparator } from "../../../renderer/shared/ui/item";
import { ListRow } from "../../../renderer/shared/ui/list-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../renderer/shared/ui/tabs";
import { diagnosticMessages as messages } from "../../messages/diagnostics";
import { ConversationTimeline } from "../conversation/ConversationTimeline";
import { savedTimelineBlock, type TimelineItem } from "../conversation/timeline";
import { Disclosure } from "../conversation/Disclosure";
import { useDiagnostics, type PricedRequest } from "./use-diagnostics";
import type { DiagnosticNotice, DiagnosticScope } from "./history";
import { formatEstimate, formatMoney } from "./format";
import type { CostIssue } from "../../../shared/model-cost-estimate";

const issueMessages: Record<CostIssue, UiMessage> = {
  quantity: messages.quantityMissing, price: messages.priceMissing, unit: messages.unitMismatch,
  tier: messages.tierUnknown, invalid: messages.invalidQuantity,
};
function requestState(request: PricedRequest) {
  if (!request.completion) return messages.noCompletion;
  const complete = ["stop", "tool-calls"].includes(request.completion.finishReason)
    && !request.notices.some(notice => notice.level === "error" || notice.code === "cancelled")
    && request.blocks.every(({ block }) => block.complete)
    && (!request.blocks.length || request.blocks.at(-1)!.block.ordinal + 1 === request.blocks.length);
  return complete ? messages.finished : messages.incomplete;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2"><h4 className="type-label">{title}</h4>{children}</section>;
}
function Notices({ notices }: { notices: readonly DiagnosticNotice[] }) {
  return <div className="space-y-2">{notices.map(notice => <Alert key={notice.id} variant={notice.level === "error" ? "destructive" : "default"}>
    <AlertDescription><span className="type-label">{notice.code}</span><p className="break-words">{notice.message}</p></AlertDescription>
  </Alert>)}</div>;
}
function RequestDetails({ request, onBack }: { request: PricedRequest; onBack(): void }) {
  const i18n = useI18n();
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  const usage = request.completion?.usage;
  const estimate = request.estimate;
  let pricingLabel = i18n.text(messages.basePrice);
  if (!request.configuredModel?.cost) pricingLabel = i18n.text(messages.priceMissing);
  else if (estimate.lines.some(line => line.issue === "tier")) pricingLabel = i18n.text(messages.tierUnknown);
  else if (estimate.fromInputTokens !== null) pricingLabel = i18n.formatMessage(messages.tier, { count: estimate.fromInputTokens });
  const content: TimelineItem[] = [];
  if (request.relatedInput) content.push({ kind: "message", ...request.relatedInput });
  content.push(...request.blocks.map(({ record, block }) => ({ ...savedTimelineBlock(record, block), usage: null })));
  if (request.summary) content.push({ kind: "summary", id: request.id, text: request.summary, usage: null });
  const metadata: [UiMessage, string][] = [
    [messages.model, request.model],
    [messages.recordedAt, i18n.formatDate(Date.parse(request.createdAt), { dateStyle: "short", timeStyle: "medium" })],
  ];
  if (request.responseId) metadata.push([messages.responseId, request.responseId]);
  if (request.requestParentId) metadata.push([messages.requestParent, request.requestParentId]);
  if (request.completion) metadata.push([messages.finishReason, [request.completion.finishReason, request.completion.rawFinishReason].filter(Boolean).join(" / ")]);
  if (request.completion?.providerResponseId) metadata.push([messages.providerResponseId, request.completion.providerResponseId]);
  return <div className="space-y-5">
    <Button ref={back} variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ArrowLeft />{i18n.text(messages.back)}</Button>
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{i18n.text(request.kind === "compression" ? messages.compression : messages.conversation)}</Badge>
      <Badge variant="secondary">{i18n.text(requestState(request))}</Badge>
      {!request.onTimeline && <Badge variant="outline">{i18n.text(messages.otherBranch)}</Badge>}
    </div>
    <dl className="space-y-2">{metadata.map(([label, value]) => <div key={label.id}>
      <dt className="type-caption">{i18n.text(label)}</dt><dd className="type-body select-text break-all">{value}</dd>
    </div>)}</dl>
    <Section title={i18n.text(messages.usage)}><dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {(["input", "output", "total", "cacheRead", "cacheWrite", "reasoning"] as const).map(key => <div key={key}>
        <dt className="type-caption">{i18n.text(messages[key])}</dt><dd className="type-body tabular-nums">{usage?.[key] == null ? "—" : i18n.formatNumber(usage[key])}</dd>
      </div>)}
    </dl></Section>
    <Section title={i18n.text(messages.pricing)}>
      <p className="type-body tabular-nums">{formatEstimate(i18n, estimate.amount, estimate.status === "partial")}</p>
      <p className="type-caption">{pricingLabel}</p>
      <div className="space-y-3">{estimate.lines.map(line => <div key={`${line.modality}/${line.item}`}>
        <div className="flex items-baseline justify-between gap-3"><span className="type-label">{i18n.text(messages[line.item])}</span>
          <span className="type-body tabular-nums">{line.amount === null ? "—" : formatMoney(i18n, line.amount)}</span></div>
        <p className="type-caption">{line.quantity === null ? "—" : i18n.formatNumber(line.quantity)} {i18n.text(messages[line.unit])}</p>
        {line.price && <p className="type-caption">{i18n.formatMessage(messages.rate, { amount: formatMoney(i18n, line.price.amount), count: line.price.per, unit: i18n.text(messages[line.price.unit]) })}</p>}
        {line.issue && <p className="type-caption">{i18n.text(issueMessages[line.issue])}</p>}
      </div>)}</div>
      {request.inputHasFiles !== false && <p className="type-caption">{i18n.text(messages.inputNotText)}</p>}
      {!estimate.lines.some(line => line.item === "reasoning") && <p className="type-caption">{i18n.text(messages.reasoningIncluded)}</p>}
    </Section>
    {request.notices.length > 0 && <Notices notices={request.notices} />}
    <Section title={i18n.text(messages.contents)}>
      <p className="type-caption">{i18n.text(messages.contentsHint)}</p>
      {content.length > 0 ? <div className="space-y-4"><ConversationTimeline items={content} /></div> : <p className="type-caption">{i18n.text(messages.noContent)}</p>}
    </Section>
  </div>;
}
export function Diagnostics() {
  const i18n = useI18n();
  const [scope, setScope] = useState<DiagnosticScope>("timeline");
  const [selection, setSelection] = useState<string | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
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
    <div ref={listHeading} tabIndex={-1} className="space-y-1 outline-none">
      <div className="flex items-baseline justify-between gap-3"><span className="type-label">{i18n.text(messages.referenceCost)}</span>
        <span className="type-body tabular-nums">{formatEstimate(i18n, data.total.amount, data.total.incomplete > 0 || data.unreadable > 0)}</span></div>
      <p className="type-caption">{i18n.formatMessage(messages.requestCount, { count: data.requests.length })}</p>
      <p className="type-caption">{i18n.text(messages.currentPrices)}</p>
      {data.total.incomplete > 0 && <p className="type-caption">{i18n.formatMessage(messages.incompleteCount, { count: data.total.incomplete })}</p>}
      {data.unreadable > 0 && <p className="type-caption">{i18n.formatMessage(messages.unreadable, { count: data.unreadable })}</p>}
    </div>
    {!data.requests.length && <p className="type-caption py-4">{i18n.text(messages.noRequests)}</p>}
    <ItemGroup>{data.requests.map((request, index) => <div key={request.id}>
      {index > 0 && <ItemSeparator />}
      <ListRow className="px-0" title={<span className="break-all">{request.configuredModel?.name ?? request.model}</span>}
        description={<>{i18n.text(request.kind === "compression" ? messages.compression : messages.conversation)} · {i18n.formatDate(Date.parse(request.createdAt), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
        media={request.kind === "compression" ? <FileText className="size-4" /> : <MessagesSquare className="size-4" />}
        actions={<span className="type-caption max-w-24 break-words text-right tabular-nums">{formatEstimate(i18n, request.estimate.amount, request.estimate.status === "partial")}</span>}
        onOpen={() => setSelection(request.id)} />
    </div>)}</ItemGroup>
    {data.notices.length > 0 && <Disclosure open={noticesOpen} onOpenChange={setNoticesOpen}
      header={<span className="type-label">{i18n.text(messages.notices)} ({data.notices.length})</span>}>
      <div className="space-y-2"><p className="type-caption">{i18n.text(messages.noticesHint)}</p><Notices notices={data.notices} /></div>
    </Disclosure>}
  </>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
    {data.error && <Alert variant="destructive" className="mb-3"><AlertDescription>{i18n.text(data.error)}</AlertDescription></Alert>}
    <Tabs className="flex min-h-0 flex-1 flex-col" value={scope} onValueChange={value => { if (value === "timeline" || value === "session") { setScope(value); setSelection(null); } }}>
      <TabsList className="w-full shrink-0" aria-label={i18n.text(messages.scope)}>
        <TabsTrigger value="timeline">{i18n.text(messages.currentPath)}</TabsTrigger><TabsTrigger value="session">{i18n.text(messages.allBranches)}</TabsTrigger>
      </TabsList>
      <TabsContent key={`${scope}:${selection ?? ""}`} value={scope} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto pt-2">{body}</TabsContent>
    </Tabs>
  </div>;
}
