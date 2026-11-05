import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AlertCircle, CircleDashed, Coins } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useI18n, useRendererCalls, useRendererEvents } from "@asterism-app/sdk/renderer";
import { primaryQuota, quotaRemaining, ReadUsage, UsageChanged, type ProviderUsageState, type QuotaItem } from "@asterism-app/sdk/contracts";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { useLifetimeSignal } from "@asterism-app/ui/use-lifetime";
import { cn } from "@asterism-app/ui/utils";
import { providersMessages as messages } from "../../messages/providers";
import { fadeTransition, islandTransition } from "../../shared/weave/motion";

/** Healthy above half, low below a quarter, exhausted at zero; the bar and dots carry the tone, the number stays quiet. */
const tone = (share: number) => share >= 0.5
  ? { track: "bg-success/25", bar: "[&>[data-slot=progress-indicator]]:bg-success", dot: "bg-success" }
  : share >= 0.25
    ? { track: "bg-warning/25", bar: "[&>[data-slot=progress-indicator]]:bg-warning", dot: "bg-warning" }
    : { track: "bg-destructive/25", bar: "[&>[data-slot=progress-indicator]]:bg-destructive", dot: "bg-destructive" };

/** Every glyph in the capsule shares one size; a glyph's own `size-*` still wins over this fallback. */
const glyphScale = "[&_svg:not([class*='size-'])]:size-3.5";

/**
 * Reads the shared host cache on mount, which queries only when the cache is missing or expired; clicking forces a query.
 * Host change notifications reread the cache; the list never polls. Only the clicked refresh is surfaced as `refreshing`;
 * mount and notification rereads update the values in place.
 */
function useUsage(providerId: string) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const lifetime = useLifetimeSignal();
  const [state, setState] = useState<ProviderUsageState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const read = useCallback(async (refresh: boolean, signal: AbortSignal) => {
    try { const value = await calls.invoke(ReadUsage, { providerId, refresh }, { signal }); if (!signal.aborted) setState(value); }
    catch { if (!signal.aborted) setState(previous => previous && { ...previous, state: "error", error: "unavailable" }); }
  }, [calls, providerId]);
  useEffect(() => {
    const controller = new AbortController();
    const subscription = events.subscribe(UsageChanged, { delivery: "latest", signal: controller.signal }, ({ data }) => {
      if (data.providerId === null || data.providerId === providerId) void read(false, controller.signal);
    });
    void subscription.ready.then(() => read(false, controller.signal), () => {});
    return () => controller.abort();
  }, [events, providerId, read]);
  const refresh = () => {
    if (refreshing) return;
    const signal = lifetime();
    setRefreshing(true);
    void read(true, signal).finally(() => { if (!signal.aborted) setRefreshing(false); });
  };
  return { state, refreshing, refresh };
}

/**
 * The capsule width follows the measured content: the first measurement applies directly, later changes animate.
 * Content views stack in one grid cell, so an entering wider view expands the capsule at once and its content fades in
 * behind the expansion, while an exiting wider view holds the width until its fade ends and the capsule then contracts.
 */
function useCapsuleWidth() {
  const [content, setContent] = useState<HTMLElement | null>(null);
  const width = useMotionValue<number | "auto">("auto");
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    if (!content) return;
    let target: number | undefined, animation: ReturnType<typeof animate> | undefined;
    const measure = () => {
      const next = content.getBoundingClientRect().width;
      if (next === target) return;
      animation?.stop();
      if (target === undefined || reducedMotion) width.set(next);
      else animation = animate(width, next, islandTransition);
      target = next;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => { observer.disconnect(); animation?.stop(); };
  }, [content, reducedMotion, width]);
  return { width, content: setContent };
}

/**
 * The capsule spends its width on one window, the one that gates work: the shortest period, whose identity stays put as values move.
 * Remaining windows collapse to tier dots so their count never changes the layout; the tooltip carries every value.
 * A clicked refresh dims the current values under a spinner and blocks repeated clicks until it settles.
 */
export function ProviderUsageButton({ providerId }: { providerId: string }) {
  const i18n = useI18n();
  const { state, refreshing, refresh } = useUsage(providerId);
  const capsule = useCapsuleWidth();
  const reducedMotion = useReducedMotion();
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
  const view = !empty ? "data"
    : !state || state.state === "loading" || refreshing ? "loading"
    : state.state === "waiting" ? "waiting"
    : state.error ? "error" : "empty";
  const dimmed = refreshing && view === "data";

  return <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>
      <button type="button" onClick={refresh} aria-busy={refreshing} aria-disabled={refreshing}
        aria-label={i18n.text(messages.usageRefresh)}
        className={cn("relative z-10 flex min-h-7 items-center rounded-full border px-2 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", glyphScale,
          drained ? "border-warning/60 bg-warning/10" : "border-border/70 bg-muted/40",
          refreshing ? "cursor-wait" : cn("hover:bg-accent", drained ? "hover:border-warning" : "hover:border-border"))}>
        <motion.span className="flex overflow-x-clip [overflow-clip-margin:2px]" style={{ width: capsule.width }}
          initial={false} animate={{ opacity: dimmed ? 0.4 : 1 }} transition={fadeTransition}>
          <span ref={capsule.content} className="grid w-max shrink-0 items-center justify-items-center">
            <AnimatePresence initial={false}>
              {view !== "empty" && <motion.span key={view} className="col-start-1 row-start-1 flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { ...fadeTransition, delay: view === "data" && !reducedMotion ? 0.16 : 0 } }}
                exit={{ opacity: 0, transition: fadeTransition }}>
                {view === "loading" ? <Spinner className="size-3.5" />
                  : view === "waiting" ? <CircleDashed className="text-muted-foreground" />
                  : view === "error" ? <AlertCircle className="text-warning" />
                  : <>
                    {state?.state === "waiting" && <CircleDashed className="text-muted-foreground" />}
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
                      <Coins className={cn("text-muted-foreground", item.remaining <= 0 && "text-destructive")} aria-hidden="true" />
                      {money(item.remaining, item.currency)}
                    </span>)}
                    {state?.error && <AlertCircle className="text-warning" aria-hidden="true" />}
                  </>}
              </motion.span>}
            </AnimatePresence>
          </span>
        </motion.span>
        <AnimatePresence initial={false}>
          {dimmed && <motion.span key="refreshing" className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
            <Spinner className="size-3.5" />
          </motion.span>}
        </AnimatePresence>
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
