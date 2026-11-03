import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CircleDashed, Coins } from "lucide-react";
import { useI18n, useRendererCalls, useRendererEvents } from "@asterism-app/sdk/renderer";
import { primaryQuota, quotaRemaining, ReadUsage, UsageChanged, type ProviderUsageState, type QuotaItem } from "@asterism-app/sdk/contracts";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { useLifetimeSignal } from "@asterism-app/ui/use-lifetime";
import { cn } from "@asterism-app/ui/utils";
import { providersMessages as messages } from "../../messages/providers";

/** Healthy above half, low below a quarter, exhausted at zero; the bar and dots carry the tone, the number stays quiet. */
const tone = (share: number) => share >= 0.5
  ? { track: "bg-success/25", bar: "[&>[data-slot=progress-indicator]]:bg-success", dot: "bg-success" }
  : share >= 0.25
    ? { track: "bg-warning/25", bar: "[&>[data-slot=progress-indicator]]:bg-warning", dot: "bg-warning" }
    : { track: "bg-destructive/25", bar: "[&>[data-slot=progress-indicator]]:bg-destructive", dot: "bg-destructive" };

/**
 * Reads the shared host cache on mount, which queries only when the cache is missing or expired; clicking forces a query.
 * Host change notifications reread the cache; the list never polls.
 */
function useUsage(providerId: string) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const lifetime = useLifetimeSignal();
  const [state, setState] = useState<ProviderUsageState | null>(null);
  const [pending, setPending] = useState(false);
  const read = useCallback(async (refresh: boolean, signal: AbortSignal) => {
    setPending(true);
    try { const value = await calls.invoke(ReadUsage, { providerId, refresh }, { signal }); if (!signal.aborted) setState(value); }
    catch { if (!signal.aborted) setState(previous => previous && { ...previous, state: "error", error: "unavailable" }); }
    finally { if (!signal.aborted) setPending(false); }
  }, [calls, providerId]);
  useEffect(() => {
    const controller = new AbortController();
    const subscription = events.subscribe(UsageChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => {
      if (data.providerId === null || data.providerId === providerId) void read(false, controller.signal);
    });
    void subscription.ready.then(() => read(false, controller.signal), () => {});
    return () => controller.abort();
  }, [events, providerId, read]);
  return { state, pending, refresh: () => { if (!pending) void read(true, lifetime()); } };
}

/**
 * The capsule spends its width on one window, the one that gates work: the shortest period, whose identity stays put as values move.
 * Remaining windows collapse to tier dots so their count never changes the layout; the tooltip carries every value.
 */
export function ProviderUsageButton({ providerId }: { providerId: string }) {
  const i18n = useI18n();
  const { state, pending, refresh } = useUsage(providerId);
  if (state?.state === "disabled") return null;
  const quotas = state?.items.filter((item): item is QuotaItem => item.type === "quota") ?? [];
  const balances = state?.items.filter(item => item.type === "balance") ?? [];
  const money = (value: number, currency: string) => i18n.formatNumber(value, { style: "currency", currency, maximumFractionDigits: 2 });
  const percent = (value: number) => i18n.formatNumber(value, { style: "percent", maximumFractionDigits: 0 });
  const empty = !quotas.length && !balances.length;
  const lead = primaryQuota(quotas);
  const leadShare = lead ? quotaRemaining(lead) : null;
  const others = quotas.filter(item => item !== lead);
  const drained = quotas.some(item => quotaRemaining(item) < 0.25);
  const glyph = !state || (state.state === "loading" || pending) && empty ? <Spinner />
    : state.state === "waiting" ? <CircleDashed className="text-muted-foreground" />
    : state.error && empty ? <AlertCircle className="text-warning" /> : null;

  return <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>
      <button type="button" onClick={refresh} aria-busy={pending}
        aria-label={i18n.text(messages.usageRefresh)}
        className={cn("relative z-10 flex min-h-7 items-center gap-2 rounded-full border px-2 py-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          drained ? "border-warning/60 bg-warning/10 hover:border-warning" : "border-border/70 bg-muted/40 hover:border-border",
          pending && !empty && "animate-pulse")}>
        {glyph}
        {leadShare !== null && <span className="flex items-center gap-1.5">
          <Progress className={cn("h-1.5 w-10", tone(leadShare).track, tone(leadShare).bar)}
            value={leadShare * 100} aria-hidden="true" />
          <span className="min-w-7 text-right text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
            {percent(leadShare)}</span>
        </span>}
        {others.length > 0 && <span className="flex items-center gap-[3px]" aria-hidden="true">
          {others.map(item => <span key={item.id}
            className={cn("size-1.5 rounded-full", tone(quotaRemaining(item)).dot, quotaRemaining(item) === 0 && "ring-1 ring-background")} />)}
        </span>}
        {balances.map(item => <span key={item.id} className="flex items-center gap-1 text-xs font-medium tabular-nums">
          <Coins className={cn("size-3.5 text-muted-foreground", item.remaining <= 0 && "text-destructive")} aria-hidden="true" />
          {money(item.remaining, item.currency)}
        </span>)}
        {state?.error && !empty && <AlertCircle className="size-3.5 text-warning" aria-hidden="true" />}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" align="end" sideOffset={6} collisionPadding={8}
      className="w-64 max-w-[calc(100vw-1rem)] space-y-2.5 text-left">
      {state?.items.map(item => <div key={item.id} className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate">{i18n.text(item.label)}</span>
          <span className="shrink-0 tabular-nums">{item.type === "balance" ? money(item.remaining, item.currency)
            : item.value.type === "quantity"
              ? `${i18n.formatNumber(item.value.remaining)} / ${i18n.formatNumber(item.value.limit)} ${i18n.text(item.value.unit)}`
              : percent(quotaRemaining(item))}</span>
        </div>
        {item.type === "quota" && <Progress className="h-1" value={quotaRemaining(item) * 100} aria-hidden="true" />}
        {item.type === "quota" && item.window.resetAt !== null && <p className="opacity-70 tabular-nums">
          {i18n.formatMessage(messages.usageResets, { time: i18n.formatDate(item.window.resetAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}
        </p>}
      </div>)}
      {state?.state === "waiting" && <p>{i18n.text(messages.usageWaiting)}</p>}
      {state?.state === "ready" && empty && <p>{i18n.text(messages.usageEmpty)}</p>}
      {state?.error && <p className="text-warning">{i18n.text(state.error === "credential" ? messages.usageCredential
        : state.error === "authentication" ? messages.usageAuthentication
        : state.error === "rate_limit" ? messages.usageRateLimited : messages.usageFailed)}</p>}
      <p className="opacity-70">{state?.updatedAt ? i18n.formatMessage(messages.usageUpdated, { time: i18n.formatDate(state.updatedAt, { hour: "numeric", minute: "2-digit" }) })
        : i18n.text(messages.usageRefresh)}</p>
    </TooltipContent>
  </Tooltip>;
}
