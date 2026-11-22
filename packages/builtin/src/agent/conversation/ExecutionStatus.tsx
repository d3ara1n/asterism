import { useI18n } from "@asterism-app/sdk/renderer";
import { Orb, type OrbState } from "@asterism-app/ui/ui/orb";
import { cn } from "@asterism-app/ui/utils";
import { AnimatePresence, motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { conversationMessages } from "../../messages/conversation";
import type { AgentActivity } from "../feedback";
import { formatElapsedTime } from "./elapsed-time";
import { executionPhase, type ExecutionPhase } from "./execution-phase";
import { conversationTransition, immediateTransition } from "./motion";
import "./execution.css";

const visibilitySteps = Array.from({ length: 21 }, (_, index) => index / 20);
const orbSize = 16;
const orbStates: Record<ExecutionPhase["kind"], OrbState> = { working: "working", compressing: "compacting", retrying: "retrying", waiting: "waiting" };

/**
 * The execution status at the end of the conversation: an orb whose motion names the phase, the phase text and the elapsed
 * time. `visible` receives the share of the row inside the scroll viewport. The composer edge light reads it, so the row
 * folds into the composer edge as it scrolls out under the tray and unfolds again on the way back.
 */
export function ExecutionStatus({ activity, compressing, startedAt, viewport, visible }: {
  activity: AgentActivity | null; compressing: boolean; startedAt: number | null;
  viewport: RefObject<HTMLElement | null>; visible: MotionValue<number>;
}) {
  const i18n = useI18n();
  const row = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const resumeAt = activity?.resumeAt ?? null;
  useEffect(() => {
    const element = row.current;
    const root = viewport.current;
    if (!element || !root) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry) visible.set(entry.intersectionRatio); }, { root, threshold: visibilitySteps });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport, visible]);
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
  return <motion.div ref={row} style={{ opacity: visible }} className="type-caption flex items-center gap-2 pt-4">
    <PhaseOrb phase={phase.kind} />
    <span role="status" className="min-w-0 truncate">{label}</span>
    {duration && <span role="timer" aria-live="off" aria-label={i18n.formatMessage(conversationMessages.elapsed, { duration })}
      className="shrink-0 tabular-nums">{duration}</span>}
  </motion.div>;
}

/** The orb remounts its drawing for each state, so successive phases cross-fade in one fixed slot. */
function PhaseOrb({ phase }: { phase: ExecutionPhase["kind"] }) {
  const reducedMotion = useReducedMotion() === true;
  return <span aria-hidden className="relative size-4 shrink-0">
    <AnimatePresence initial={false}>
      <motion.span key={phase} className={cn("absolute inset-0", phase === "retrying" || phase === "waiting" ? "text-warning" : "text-primary-text")}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={reducedMotion ? immediateTransition : conversationTransition}>
        <Orb state={orbStates[phase]} size={orbSize} className="block" />
      </motion.span>
    </AnimatePresence>
  </span>;
}

/**
 * A light travelling along the composer tray's top edge, standing in for the execution status while that row is out of view.
 * It grows from the left, where the orb sits, as the row leaves, so only one of the two moves at a time.
 */
export function ExecutionEdge({ running, visible }: { running: boolean; visible: MotionValue<number> }) {
  const reducedMotion = useReducedMotion() === true;
  const opacity = useTransform(visible, [0, 0.6], [1, 0]);
  const scaleX = useTransform(visible, [0, 1], [1, 0.08]);
  return <AnimatePresence>
    {running && <motion.span key="execution" aria-hidden className="pointer-events-none absolute inset-x-5 -top-px h-px"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={reducedMotion ? immediateTransition : conversationTransition}>
      <motion.span className="execution-trace" style={{ opacity, scaleX, originX: 0 }} />
    </motion.span>}
  </AnimatePresence>;
}
