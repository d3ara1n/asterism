import { useEffect, useState } from "react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { subagentMessages as messages } from "../messages/subagents";
import type { TaskSnapshot, TaskSummary } from "./contract";

export function stateOf(status: TaskSnapshot["status"]) { return status.phase === "finished" ? status.outcome : status.phase; }
export const stateTones: Record<ReturnType<typeof stateOf>, StatusTone> = {
  queued: "neutral", running: "progress", succeeded: "success", partial: "warning", failed: "error", cancelled: "neutral",
};
export function TaskStatus({ status }: { status: TaskSnapshot["status"] }) {
  const state = stateOf(status);
  return <StatusBadge tone={stateTones[state]}>{useI18n().formatMessage(messages.state, { state })}</StatusBadge>;
}
/** Status at one moment, such as a snapshot read; plain text so it does not read as live. */
export function TaskStateText({ status }: { status: TaskSnapshot["status"] }) {
  return <span className="type-caption">{useI18n().formatMessage(messages.state, { state: stateOf(status) })}</span>;
}

/** Elapsed time keeps counting between published updates while the task runs. */
function useLiveElapsed(elapsedMs: number, live: boolean): number {
  const [received, setReceived] = useState(() => ({ elapsedMs, at: Date.now() }));
  const [now, setNow] = useState(Date.now);
  if (received.elapsedMs !== elapsedMs) setReceived({ elapsedMs, at: Date.now() });
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return live ? received.elapsedMs + Math.max(0, now - received.at) : elapsedMs;
}
/** Model, request count, and elapsed time, followed by optional further facts. */
export function Usage({ usage, live, extra = [] }: { usage: TaskSummary["usage"]; live: boolean; extra?: string[] }) {
  const i18n = useI18n();
  const elapsedMs = useLiveElapsed(usage.elapsedMs, live);
  const parts = [usage.model, i18n.formatMessage(messages.usage, { requests: usage.requests, seconds: Math.round(elapsedMs / 1000) }), ...extra];
  return <p className="type-caption">{parts.filter(Boolean).join(" · ")}</p>;
}
