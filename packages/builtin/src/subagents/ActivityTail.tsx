import type { ReactNode } from "react";
import { Brain, Clock, MessageSquarePlus, TextQuote, Wrench, type LucideIcon } from "lucide-react";
import { useI18n, useRendererTools } from "@asterism-app/sdk/renderer";
import { cn } from "@asterism-app/ui/utils";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { subagentMessages as messages } from "../messages/subagents";
import type { ActivityEntry } from "./contract";

const toolTones: Record<Extract<ActivityEntry, { kind: "tool" }>["state"], StatusTone> = {
  running: "progress", succeeded: "success", partial: "warning", rejected: "error", failed: "error", cancelled: "neutral", unknown: "neutral",
};

function Row({ tone, icon, children }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode }) {
  return <li className="flex min-w-0 items-center gap-2"><StatusIcon tone={tone} icon={icon} className="size-3.5 shrink-0" />{children}</li>;
}
/** Quoted italic text on one line: the icon tells model output from instructions; the closing quote survives truncation. */
function Quoted({ label, text, title, muted }: { label: string; text: string; title?: string; muted?: boolean }) {
  return <span className={cn("flex min-w-0 italic", muted && "text-muted-foreground")} title={title ?? text}>
    <span className="sr-only">{label}: </span>
    <span aria-hidden="true">“</span><span className="min-w-0 truncate">{text}</span><span aria-hidden="true">”</span>
  </span>;
}

export type SteerState = "delivered" | "pending" | "undelivered";
/** Instructions sent to the task; queued or late instructions carry their delivery state. */
export function SteerRow({ text, state = "delivered" }: { text: string; state?: SteerState }) {
  const i18n = useI18n();
  return <Row tone={state === "undelivered" ? "warning" : "neutral"} icon={state === "pending" ? Clock : MessageSquarePlus}>
    <Quoted label={i18n.text(messages.steering)} text={text} muted={state === "pending"} />
    {state !== "delivered" && <span className="shrink-0 text-muted-foreground">{i18n.text(state === "pending" ? messages.pending : messages.undelivered)}</span>}
  </Row>;
}

/** One row per step: status icon, then the tool's localized name and subject, or the quoted text. */
export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const i18n = useI18n(), tools = useRendererTools();
  switch (entry.kind) {
    case "steer": return <SteerRow text={entry.text} />;
    case "text": return <Row tone="neutral" icon={TextQuote}><Quoted label={i18n.text(messages.output)} text={entry.preview} muted /></Row>;
    case "thinking": return <Row tone={entry.state === "running" ? "progress" : "neutral"} icon={Brain}><span>{i18n.text(messages.thinking)}</span></Row>;
    case "tool": {
      const label = tools.label(entry.name, entry.implementation);
      return <Row tone={toolTones[entry.state]} icon={entry.state === "running" ? undefined : Wrench}>
        {label ? <span className="shrink-0" title={entry.name}>{label}</span> : <span className="shrink-0 font-mono">{entry.name}</span>}
        {entry.subject && <span className="min-w-0 truncate font-mono text-muted-foreground" title={entry.subject}>{entry.subject}</span>}
        <span className="sr-only">{i18n.formatMessage(messages.toolState, { state: entry.state })}</span>
      </Row>;
    }
  }
}

/** Process steps in order, followed by instructions still waiting in the task's input queue. */
export function ActivityList({ entries, queued = [], hidden = 0 }: { entries: readonly ActivityEntry[]; queued?: readonly string[]; hidden?: number }) {
  const i18n = useI18n();
  return <div className="flex min-w-0 flex-col gap-1 text-xs">
    {hidden > 0 && <p className="type-caption">{i18n.formatMessage(messages.earlierSteps, { count: hidden })}</p>}
    <ul className="flex min-w-0 flex-col gap-1">
      {entries.map((entry, index) => <ActivityRow key={hidden + index} entry={entry} />)}
      {queued.map((text, index) => <SteerRow key={`queued:${index}`} text={text} state="pending" />)}
    </ul>
  </div>;
}
/** Recent steps supplied by the pool, with the count of omitted earlier steps. */
export function ActivityTail({ entries, total }: { entries: readonly ActivityEntry[]; total: number }) {
  return total ? <ActivityList entries={entries} hidden={total - entries.length} /> : null;
}
/** Instructions that reached the task and those that arrived too late, for a finished task. */
export function InstructionList({ activity, undelivered }: { activity: readonly ActivityEntry[]; undelivered: readonly string[] }) {
  const delivered = activity.flatMap(entry => entry.kind === "steer" ? [entry.text] : []);
  if (!delivered.length && !undelivered.length) return null;
  return <ul className="flex min-w-0 flex-col gap-1 text-xs">
    {delivered.map((text, index) => <SteerRow key={`d:${index}`} text={text} />)}
    {undelivered.map((text, index) => <SteerRow key={`u:${index}`} text={text} state="undelivered" />)}
  </ul>;
}
