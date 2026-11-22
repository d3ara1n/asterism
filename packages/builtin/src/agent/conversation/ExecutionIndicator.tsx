import { useI18n } from "@asterism-app/sdk/renderer";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { conversationMessages } from "../../messages/conversation";
import type { AgentActivity } from "../feedback";
import { formatElapsedTime } from "./elapsed-time";
import { executionPhase } from "./execution-phase";
import { conversationTransition, immediateTransition } from "./motion";
import "./execution.css";

type ExecutionIndicatorProps = { running: boolean; activity: AgentActivity | null; compressing: boolean; startedAt: number | null };

/**
 * The conversation's execution indicator, rendered inside the composer tray so its top edge is the tray's.
 * A light travels along that edge while work is in progress, and a tab standing on the edge names the phase and elapsed time.
 * The tab covers the tray border beneath it and follows the tray's focus tone, so it reads as part of the tray.
 */
export function ExecutionIndicator({ running, ...props }: ExecutionIndicatorProps) {
  const reducedMotion = useReducedMotion() === true;
  return <AnimatePresence>
    {running && <motion.div key="execution" className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={reducedMotion ? immediateTransition : conversationTransition}>
      <span aria-hidden className="execution-trace" />
      <ExecutionTab {...props} />
    </motion.div>}
  </AnimatePresence>;
}

/** Clock updates stay within this tab; elapsed time spans requests, compaction, and retry waits. */
function ExecutionTab({ activity, compressing, startedAt }: Omit<ExecutionIndicatorProps, "running">) {
  const i18n = useI18n();
  const [now, setNow] = useState(Date.now);
  const resumeAt = activity?.resumeAt ?? null;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), resumeAt === null ? 1000 : 250);
    return () => clearInterval(timer);
  }, [resumeAt, startedAt]);
  const phase = executionPhase(activity, compressing, now);
  const duration = formatElapsedTime(startedAt, now);
  const label = phase.kind === "compressing" ? i18n.text(conversationMessages.compressing)
    : phase.kind === "working" ? i18n.formatMessage(conversationMessages.workingHint)
    : phase.kind === "waiting" ? i18n.formatMessage(conversationMessages.retryWaiting, { attempt: phase.attempt, max: phase.max, seconds: phase.seconds })
    : i18n.formatMessage(conversationMessages.retrying, { attempt: phase.attempt, max: phase.max });
  return <p className="absolute bottom-full left-3 flex h-5 max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-t-md border border-b-0 bg-card-shell px-2 text-xs text-muted-foreground transition-[border-color] duration-200 group-has-[[data-slot=input-group-control]:focus]/tray:border-ring">
    {duration && <span role="timer" aria-live="off" aria-label={i18n.formatMessage(conversationMessages.elapsed, { duration })}
      className="shrink-0 tabular-nums">{duration}</span>}
    <span role="status" className="truncate">{label}</span>
  </p>;
}
