import { useEffect, useState } from "react";
import { AlertCircle, Coins } from "lucide-react";
import { primaryQuota, quotaRemaining, type UsageItem } from "@atelier/sdk/contracts";
import { useI18n, useProviderUsage } from "@atelier/sdk/renderer";
import { AgentToolbarItem, useAgentModelSelection } from "@atelier/builtin-api/renderer";
import { Progress } from "@atelier/ui/ui/progress";
import { Spinner } from "@atelier/ui/ui/spinner";
import { MetricTooltip } from "../agent/conversation/MetricTooltip";
import { usageMessages as messages } from "../messages/usage";

/** 查询消费方只理解公开结果类型；不导入任何厂商查询实现或预设。 */
export function UsageToolbarItem() {
  const { model } = useAgentModelSelection();
  const { state } = useProviderUsage(model?.providerId ?? null);
  const i18n = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!state || state.state === "disabled" || (!state.usage && !state.error)) return null;
  const primary = primaryQuota(state.items);
  const balance = state.items.find(item => item.type === "balance");
  const percentage = (value: number) => i18n.formatNumber(value, { style: "percent", maximumFractionDigits: 0 });
  const amount = (item: UsageItem) => item.type === "balance"
    ? i18n.formatNumber(item.remaining, { style: "currency", currency: item.currency }) : percentage(quotaRemaining(item));
  const value = primary ? percentage(quotaRemaining(primary)) : balance ? amount(balance) : "—";
  const exhausted = state.items.some(item => item.type === "quota" && quotaRemaining(item) === 0);
  const stale = state.updatedAt !== null && (state.state === "error" || now - state.updatedAt > 120_000);
  const countdown = (reset: number) => {
    const minutes = Math.max(1, Math.ceil((reset - now) / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };
  return <AgentToolbarItem><MetricTooltip label={i18n.text(messages.title)} value={value}
    icon={<>
      {primary ? <Progress className="h-1.5 w-14" value={quotaRemaining(primary) * 100}
        aria-label={i18n.text(primary.label)} aria-valuetext={i18n.formatMessage(messages.remaining, { value })} />
        : balance ? <Coins /> : state.state === "loading" ? <Spinner /> : <AlertCircle />}
      {(state.error || exhausted || stale) && (primary || balance) && <AlertCircle className="size-3.5 text-warning" />}
    </>}>
    <h4 className="type-label">{i18n.text(messages.title)}</h4>
    {state.items.map(item => <div key={item.id} className="space-y-1">
      <div className="flex items-baseline justify-between gap-4">
        <span>{i18n.text(item.label)}</span><span className="tabular-nums">{i18n.formatMessage(messages.remaining, { value: amount(item) })}</span>
      </div>
      {item.type === "quota" && <>
        <Progress className="h-1" value={quotaRemaining(item) * 100} aria-label={i18n.text(item.label)} />
        {item.value.type === "quantity" && <p className="type-caption tabular-nums">
          {i18n.formatNumber(item.value.remaining)} / {i18n.formatNumber(item.value.limit)} {i18n.text(item.value.unit)}
        </p>}
        <p className="type-caption tabular-nums">{item.window.resetAt === null ? i18n.text(messages.resetUnknown)
          : item.window.resetAt <= now ? i18n.text(messages.resetPending)
          : i18n.formatMessage(messages.resets, { duration: countdown(item.window.resetAt) })}</p>
        {item.window.resetAt !== null && <p className="type-caption">{i18n.formatDate(item.window.resetAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      </>}
    </div>)}
    {state.items.length === 0 && !state.error && <p className="type-caption">{i18n.text(state.state === "loading" ? messages.loading : messages.empty)}</p>}
    {exhausted && <p className="type-caption">{i18n.text(messages.exhausted)}</p>}
    {stale && <p className="type-caption">{i18n.text(messages.stale)}</p>}
    {state.error && <p className="type-caption">{i18n.text(messages[state.error])}</p>}
    {state.updatedAt !== null && <p className="type-caption">{i18n.formatMessage(messages.updated, { time: i18n.formatDate(state.updatedAt, { hour: "numeric", minute: "2-digit" }) })}</p>}
  </MetricTooltip></AgentToolbarItem>;
}
