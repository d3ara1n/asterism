import type { ReactNode } from "react";
import type { z } from "zod";
import { Bot, Coins, Cpu, Gauge, Timer } from "lucide-react";
import { availableThinkingLevels, ModelCatalog, modelReference, parseModelExpression } from "@asterism-app/sdk/contracts";
import { formatUsageAmount, formatUsagePeriod, formatUsageQuantity, toolRenderer, useI18n, useRendererCatalogs, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Progress } from "@asterism-app/ui/ui/progress";
import { StatusText } from "@asterism-app/ui/ui/status";
import { formatCount } from "@asterism-app/ui/format-count";
import { thinkingLabels, modelSelectionMessages } from "@asterism-app/ui/messages/model-selection";
import { usageLevelTones } from "@asterism-app/ui/usage-level";
import { cn } from "@asterism-app/ui/utils";
import { agentsMessages as messages } from "../../messages/agents";
import { contextMessages } from "../../messages/context";
import { usageMessages } from "../../messages/usage";
import { useModelNames } from "../../models/names";
import { ThinkingMeter } from "../../models/thinking-levels";
import { WindowMeter } from "../context/WindowMeter";
import { percent } from "../panel-kit";
import { balanceLevel, balanceUnit, quotaLevel } from "./usage";
import { GetAgentStateResult } from "./contract";

type State = z.infer<typeof GetAgentStateResult.schema>;
type Props = ToolRenderProps<State>;

const ratioOf = ({ used, max }: State["context"]) => used !== null && max ? Math.min(used / max, 1) : null;

function Header({ result }: Props) {
  const i18n = useI18n();
  const names = useModelNames();
  const data = result?.data;
  const ratio = data ? ratioOf(data.context) : null;
  return <ToolHeader label={i18n.text(messages.getState)} subject={data?.role}
    summary={data && (names.model(data.model) ?? data.model)}
    meta={ratio !== null && percent(i18n, data!.context.used!, data!.context.max!)} />;
}

function Panel({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
    <header className="flex items-center gap-1.5 type-label [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}<h4 className="min-w-0 flex-1 truncate">{title}</h4>{aside}
    </header>
    {children}
  </section>;
}

function Identity({ state }: { state: State }) {
  const i18n = useI18n();
  const names = useModelNames();
  const catalog = useRendererCatalogs().get(ModelCatalog);
  const expression = parseModelExpression(state.model);
  const model = catalog?.models.find(entry => modelReference(entry) === state.model) ?? null;
  // Levels come from current configuration; without it the selected level still reads as text.
  const levels = model ? availableThinkingLevels(model) : [];
  return <Panel icon={<Bot aria-hidden="true" />} title={i18n.text(messages.identity)}>
    <div className="min-w-0 space-y-0.5">
      <p className="truncate type-section" title={state.role}>{state.role}</p>
      <p className="flex min-w-0 items-center gap-1.5 text-sm" title={state.model}>
        <Cpu aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{model?.name ?? expression?.model ?? state.model}</span>
      </p>
      {expression && <p className="truncate type-caption">{names.provider(expression.provider)}</p>}
    </div>
    <div className="mt-auto flex items-center justify-between gap-2 type-caption">
      <span>{i18n.text(messages.thinking)}</span>
      <span className={cn("inline-flex items-center gap-1.5", state.thinking !== null && "text-foreground")}>
        <ThinkingMeter levels={levels} value={state.thinking} />
        {state.thinking === null ? i18n.text(modelSelectionMessages.providerDefault) : i18n.text(thinkingLabels[state.thinking])}
      </span>
    </div>
  </Panel>;
}

function Context({ context }: { context: State["context"] }) {
  const i18n = useI18n();
  const ratio = ratioOf(context);
  return <Panel icon={<Gauge aria-hidden="true" />} title={i18n.text(contextMessages.window)}>
    <div className="flex items-baseline justify-between gap-3">
      <p className="flex min-w-0 items-baseline gap-1.5">
        <span className="type-page tabular-nums">{context.used !== null ? formatCount(context.used) : "—"}</span>
        <span className="truncate type-caption tabular-nums">{context.max !== null
          ? i18n.formatMessage(contextMessages.windowOf, { window: formatCount(context.max) }) : i18n.text(contextMessages.tokens)}</span>
      </p>
      {ratio !== null && <span className="type-section tabular-nums">{percent(i18n, context.used!, context.max!)}</span>}
    </div>
    {context.used === null && <p className="type-caption">{i18n.text(contextMessages.noUsage)}</p>}
    {context.max === null && <p className="type-caption">{i18n.text(contextMessages.windowUnknown)}</p>}
    {context.used !== null && context.max !== null && <WindowMeter input={context.used} window={context.max} fill="bg-primary" />}
  </Panel>;
}

function BalanceRow({ item }: { item: NonNullable<State["balance"]>[number] }) {
  const i18n = useI18n();
  const unit = balanceUnit(item.unit);
  const level = balanceLevel(item.remaining, unit);
  return <li className="min-w-0 space-y-0.5">
    <p className="flex items-center gap-1.5 type-caption">
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", usageLevelTones[level].dot)} />
      <span className="truncate" title={item.name}>{item.name}</span>
    </p>
    <p className={cn("type-page tabular-nums", level !== "available" && usageLevelTones[level].text)}>
      {formatUsageAmount(i18n, item.remaining, unit)}
    </p>
  </li>;
}

/** Results record absolute reset times; a countdown would drift as the call ages in history. */
function QuotaRow({ item }: { item: NonNullable<State["quota"]>[number] }) {
  const i18n = useI18n();
  const level = quotaLevel(item.remaining);
  const tone = usageLevelTones[level];
  const label = [item.name, item.periodSeconds === null ? null : formatUsagePeriod(i18n, item.periodSeconds)]
    .filter(part => part !== null).join(" · ") || i18n.text(messages.quota);
  const share = i18n.formatNumber(item.remaining, { style: "percent", maximumFractionDigits: 0 });
  return <li className="min-w-0 space-y-1">
    <div className="flex items-baseline justify-between gap-3 type-caption">
      <span className="truncate" title={label}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", level === "available" ? "text-foreground" : tone.text)}>
        {i18n.formatMessage(usageMessages.remaining, { value: share })}
      </span>
    </div>
    <Progress className={cn("h-1.5", tone.track, tone.bar)} value={item.remaining * 100} aria-label={label} aria-valuetext={share} />
    {(item.amount || item.resetsAt) && <div className="flex flex-wrap justify-between gap-x-3 type-caption tabular-nums">
      {item.amount && <span>{formatUsageQuantity(i18n, item.amount.remaining, item.amount.limit, item.amount.unit)}</span>}
      {item.resetsAt && <span className="ml-auto">{i18n.formatMessage(messages.resetsAt, {
        time: i18n.formatDate(Date.parse(item.resetsAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}</span>}
    </div>}
  </li>;
}

function Usage({ balance, quota, failed }: { balance: State["balance"]; quota: State["quota"]; failed: boolean }) {
  const i18n = useI18n();
  const allowances = quota?.filter(item => item.category === "allowance") ?? [];
  const rateLimits = quota?.filter(item => item.category === "rate_limit") ?? [];
  const empty = !balance && !quota;
  return <Panel icon={<Coins aria-hidden="true" />} title={i18n.text(messages.usage)}
    aside={failed && <StatusText tone="warning">{i18n.text(messages.usageUnavailable)}</StatusText>}>
    {balance && <ul className="space-y-2">{balance.map((item, index) => <BalanceRow key={index} item={item} />)}</ul>}
    {allowances.length > 0 && <ul className="space-y-2.5">{allowances.map((item, index) => <QuotaRow key={index} item={item} />)}</ul>}
    {rateLimits.length > 0 && <div className="space-y-2">
      <p className="flex items-center gap-1.5 type-label"><Timer aria-hidden="true" className="size-3.5" />{i18n.text(usageMessages.rateLimits)}</p>
      <ul className="space-y-2.5">{rateLimits.map((item, index) => <QuotaRow key={index} item={item} />)}</ul>
    </div>}
    {empty && !failed && <p className="type-caption">{i18n.text(messages.noUsage)}</p>}
  </Panel>;
}

function Body({ result }: Props) {
  const data = result?.data;
  if (!data) return null;
  return <div className="@container/state">
    <div className="grid grid-cols-1 gap-2 @min-[32rem]/state:grid-cols-2 @min-[48rem]/state:grid-cols-3">
      <Identity state={data} />
      <Context context={data.context} />
      <Usage balance={data.balance} quota={data.quota} failed={result.kind === "partial"} />
    </div>
  </div>;
}

const header = { headerRenderer: Header };
export const agentStateToolRenderer = toolRenderer(GetAgentStateResult, {
  label: messages.getState, icon: <Bot className="size-3.5" />,
  input: header, execution: header, result: { headerRenderer: Header, bodyRenderer: Body },
});
