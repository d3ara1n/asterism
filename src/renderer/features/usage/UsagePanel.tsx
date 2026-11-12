import { useEffect, useState } from "react";
import { AlertCircle, ChevronUp, RotateCw, Timer } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatUsageAmount, formatUsageQuantity, usageItemLabel } from "@asterism-app/sdk/renderer";
import { quotaRemaining, usageItemLevel, usageLevel, type ProviderUsageState, type UsageItem } from "@asterism-app/sdk/contracts";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { usageLevelTones } from "@asterism-app/ui/usage-level";
import { cn } from "@asterism-app/ui/utils";
import type { ModelProvider } from "../../../shared/configuration";
import { useI18n } from "../../shared/i18n";
import { appMessages } from "../../messages/app";
import { providersMessages } from "../../messages/providers";
import { islandTransition } from "../../shared/weave/motion";
import { resetCountdown } from "./countdown";
import { leadingItem } from "./leading-item";
import { SignalDot } from "./SignalDot";
import { useProviderUsages } from "./use-usage";

type I18n = ReturnType<typeof useI18n>;
const handleSegment = "flex items-center rounded-md outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const percent = (i18n: I18n, value: number) => i18n.formatNumber(value, { style: "percent", maximumFractionDigits: 0 });
const itemValue = (i18n: I18n, item: UsageItem) => item.type === "balance"
  ? formatUsageAmount(i18n, item.remaining, item.unit, { compact: true }) : percent(i18n, quotaRemaining(item));
const errorMessage = (error: NonNullable<ProviderUsageState["error"]>) => error === "credential" ? providersMessages.usageCredential
  : error === "authentication" ? providersMessages.usageAuthentication
  : error === "rate_limit" ? providersMessages.usageRateLimited : providersMessages.usageFailed;
/** A note for states without items; items speak for themselves. */
const stateNote = (state: ProviderUsageState | undefined) => !state || state.state === "loading" ? null
  : state.state === "waiting" ? providersMessages.usageWaiting
  : state.state === "ready" && !state.items.length ? providersMessages.usageEmpty : null;

/**
 * Two arrangements of one usage view. Compact sits flush in the sidebar as a handle with one signal lamp per connection;
 * expanded lifts it into a floating panel over the conversation list with one meter per connection. Only the handle switches
 * arrangements. Reads follow mount and change notifications; expanded also polls, and its single refresh forces every query.
 */
export function UsagePanel({ modelProviders }: { modelProviders: readonly ModelProvider[] }) {
  const i18n = useI18n();
  const providers = modelProviders.filter(provider => provider.enabled && provider.usage);
  const [open, setOpen] = useState(false);
  const usage = useProviderUsages(providers.map(provider => provider.id), open);
  if (!providers.length) return null;
  const label = i18n.text(appMessages.usagePanel);
  return <div className="relative -mx-1.5 mt-2 h-9 shrink-0">
    <div className={cn("absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-lg border transition-[background-color,border-color,box-shadow] duration-200",
      open ? "border-border bg-popover text-popover-foreground shadow-lg" : "border-transparent")}>
      <AnimatePresence initial={false}>
        {open && <motion.div key="meters" className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={islandTransition}>
          <ul id="usage-meters" className="flex max-h-[min(28rem,60vh)] flex-col gap-3 overflow-y-auto px-2.5 pb-2 pt-3">
            {providers.map(provider => <ProviderMeter key={provider.id} provider={provider} state={usage.states.get(provider.id)} />)}
          </ul>
        </motion.div>}
      </AnimatePresence>
      {/* Split handle: the toggle takes the remaining width and the refresh segment the full height, joined by a divider. */}
      <div className={cn("flex h-[34px] items-stretch", open && "border-t")}>
        <button type="button" aria-expanded={open} aria-controls={open ? "usage-meters" : undefined} onClick={() => setOpen(!open)}
          className={cn(handleSegment, "min-w-0 flex-1 gap-2 pl-2 text-left")}>
          <ChevronUp aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")} />
          <span className="type-label shrink-0">{label}</span>
          {/* Clip only horizontally and leave the glow its margin. */}
          {!open && <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-x-clip pr-2 [overflow-clip-margin:4px]">
            {providers.map(provider => <ProviderLamp key={provider.id} provider={provider} state={usage.states.get(provider.id)} />)}
          </span>}
        </button>
        {open && <>
          <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={i18n.text(providersMessages.usageRefresh)} aria-busy={usage.refreshing} aria-disabled={usage.refreshing}
                onClick={usage.refresh} className={cn(handleSegment, "w-[34px] shrink-0 justify-center text-muted-foreground hover:text-foreground", usage.refreshing && "cursor-wait")}>
                <RotateCw className={cn("size-3.5", usage.refreshing && "motion-safe:animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{i18n.text(providersMessages.usageRefresh)}</TooltipContent>
          </Tooltip>
        </>}
      </div>
    </div>
  </div>;
}

/** Compact lamp; hovering names the connection and its deciding value. */
function ProviderLamp({ provider, state }: { provider: ModelProvider; state: ProviderUsageState | undefined }) {
  const i18n = useI18n();
  const lead = state ? leadingItem(state.items) : null;
  const note = stateNote(state);
  return <Tooltip delayDuration={150}>
    <TooltipTrigger asChild>
      <span className="flex rounded-full"><SignalDot level={state ? usageLevel(state.items) : null} /></span>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={6} collisionPadding={8} className="max-w-56 space-y-0.5">
      <p className="font-medium">{provider.name}</p>
      {lead && <p className="tabular-nums opacity-80">{usageItemLabel(i18n, lead)} · {itemValue(i18n, lead)}</p>}
      {!lead && note && <p className="opacity-80">{i18n.text(note)}</p>}
      {state?.error && <p className="opacity-80">{i18n.text(errorMessage(state.error))}</p>}
    </TooltipContent>
  </Tooltip>;
}

/** One connection's meter: identity, then each reported item with its value; windows add a level bar and reset countdown. */
function ProviderMeter({ provider, state }: { provider: ModelProvider; state: ProviderUsageState | undefined }) {
  const i18n = useI18n();
  const now = useNow();
  const note = stateNote(state);
  return <li className="min-w-0">
    <div className="flex h-5 items-center gap-2">
      <SignalDot level={state ? usageLevel(state.items) : null} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={provider.name}>{provider.name}</span>
      {(!state || state.state === "loading") && <Spinner className="size-3 text-muted-foreground" />}
      {state?.error && <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 text-warning" />}
    </div>
    <div className="mt-1 flex flex-col gap-1.5 pl-5">
      {state?.items.map(item => {
        const level = usageItemLevel(item), tone = usageLevelTones[level];
        return <div key={item.id} className="min-w-0">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{usageItemLabel(i18n, item)}</span>
            <span className={cn("shrink-0 tabular-nums", level === "available" ? "text-foreground" : tone.text)}>{itemValue(i18n, item)}</span>
          </div>
          {item.type === "quota" && <>
            <div className={cn("mt-1 h-[3px] overflow-hidden rounded-full", tone.track)}>
              <div className={cn("h-full rounded-full transition-[width] duration-500", tone.dot)} style={{ width: `${quotaRemaining(item) * 100}%` }} />
            </div>
            {/* One detail line under the bar: the quantity reads left, the reset countdown right. */}
            {(item.value.type === "quantity" || item.window.resetAt !== null) && <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-muted-foreground tabular-nums">
              <span className="min-w-0 flex-1 truncate">{item.value.type === "quantity"
                && formatUsageQuantity(i18n, item.value.remaining, item.value.limit, item.value.unit)}</span>
              {item.window.resetAt !== null && <span className="flex shrink-0 items-center gap-0.5">
                <Timer aria-hidden="true" className="size-3" />{resetCountdown(now, item.window.resetAt)}
              </span>}
            </div>}
          </>}
        </div>;
      })}
      {note && <p className="type-caption">{i18n.text(note)}</p>}
      {state?.error && <p className="text-xs text-warning">{i18n.text(errorMessage(state.error))}</p>}
    </div>
  </li>;
}

/** Countdown clock while a meter is mounted. */
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
