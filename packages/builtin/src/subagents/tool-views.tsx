import { useEffect, useState } from "react";
import { Brain, MessageSquarePlus, Wrench } from "lucide-react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { Markdown } from "../agent/conversation/Markdown";
import { subagentMessages as messages } from "../messages/subagents";
import { TaskStatus } from "./PoolCard";
import {
  recentActivity, type ActivityEntry, type DelegateInput, type TaskSnapshot, type TaskSummary, type WaitEntry,
} from "./contract";

const toolTones: Record<Extract<ActivityEntry, { kind: "tool" }>["state"], StatusTone> = {
  running: "progress", succeeded: "success", partial: "warning", rejected: "error", failed: "error", cancelled: "neutral", unknown: "neutral",
};

/** One row per step: status icon, operation, and a single-line subject. */
function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const i18n = useI18n();
  if (entry.kind === "steer") return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone="neutral" icon={MessageSquarePlus} className="size-3.5 shrink-0" />
    <span className="shrink-0">{i18n.text(messages.steering)}</span>
    <span className="min-w-0 truncate text-muted-foreground" title={entry.text}>{entry.text}</span>
  </li>;
  if (entry.kind === "thinking") return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone={entry.state === "running" ? "progress" : "neutral"} icon={Brain} className="size-3.5 shrink-0" />
    <span>{i18n.text(messages.thinking)}</span>
  </li>;
  return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone={toolTones[entry.state]} icon={entry.state === "running" ? undefined : Wrench} className="size-3.5 shrink-0" />
    <span className="shrink-0 font-mono">{entry.name}</span>
    {entry.subject && <span className="min-w-0 truncate font-mono text-muted-foreground" title={entry.subject}>{entry.subject}</span>}
    <span className="sr-only">{i18n.formatMessage(messages.toolState, { state: entry.state })}</span>
  </li>;
}
/** The most recent steps. When the full log is present, earlier steps expand in place; otherwise their count is shown. */
function ActivityTail({ entries, total }: { entries: readonly ActivityEntry[]; total: number }) {
  const i18n = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!total) return null;
  const complete = entries.length === total;
  const tail = expanded && complete ? entries : entries.slice(-recentActivity);
  const hidden = total - tail.length;
  return <div className="flex min-w-0 flex-col gap-1 text-xs">
    {complete && total > recentActivity
      ? <Button type="button" variant="link" size="sm" className="h-auto w-fit p-0 type-caption" aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>
        {expanded ? i18n.text(messages.fewerSteps) : i18n.formatMessage(messages.earlierSteps, { count: hidden })}</Button>
      : hidden > 0 && <p className="type-caption">{i18n.formatMessage(messages.earlierSteps, { count: hidden })}</p>}
    <ul className="flex min-w-0 flex-col gap-1">{tail.map((entry, index) => <ActivityRow key={hidden + index} entry={entry} />)}</ul>
  </div>;
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
function Usage({ usage, live }: { usage: TaskSummary["usage"]; live: boolean }) {
  const i18n = useI18n();
  const elapsedMs = useLiveElapsed(usage.elapsedMs, live);
  return <p className="type-caption">{usage.model ? `${usage.model} · ` : ""}
    {i18n.formatMessage(messages.usage, { requests: usage.requests, seconds: Math.round(elapsedMs / 1000) })}</p>;
}
/** Status line identifying one task: ID, role, status, and the task's first line. */
function TaskLine({ task }: { task: Pick<TaskSummary, "id" | "role" | "task" | "status"> }) {
  return <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0 font-mono">{task.id}</span>
    <span className="shrink-0 type-caption">{task.role}</span>
    <span className="min-w-0 flex-1 truncate" title={task.task}>{task.task}</span>
    <TaskStatus status={task.status} />
  </div>;
}

/* ---------- delegate ---------- */

type DelegateProps = ToolRenderProps<TaskSnapshot, null, DelegateInput>;
function DelegateHeader({ phase, args, result }: DelegateProps) {
  const i18n = useI18n();
  const role = phase === "input" ? undefined : args.role;
  return <ToolHeader label={i18n.text(messages.delegate)} subject={role} meta={result?.data?.input.id} />;
}
function DelegateBody({ args, phase }: DelegateProps) {
  if (phase === "input") return null;
  return <p className="type-body whitespace-pre-wrap break-words">{args.task}</p>;
}
export const delegateViews = {
  label: messages.delegate,
  input: { headerRenderer: DelegateHeader },
  execution: { headerRenderer: DelegateHeader, bodyRenderer: DelegateBody },
  result: { headerRenderer: DelegateHeader, bodyRenderer: DelegateBody },
} satisfies ToolRendererDefinition<TaskSnapshot, null, DelegateInput>;

/* ---------- check: one task's snapshot ---------- */

type CheckProps = ToolRenderProps<TaskSnapshot, string>;
function CheckHeader({ phase, target, result }: CheckProps) {
  const i18n = useI18n();
  const status = result?.data?.status;
  return <ToolHeader label={i18n.text(messages.check)} subject={phase === "input" ? undefined : target} monospace
    meta={status && <TaskStatus status={status} />} />;
}
function CheckBody({ result }: CheckProps) {
  const i18n = useI18n(), task = result?.data;
  if (!task) return null;
  const { status } = task, finished = status.phase === "finished";
  return <div className="flex min-w-0 flex-col gap-3">
    <TaskLine task={{ id: task.input.id, role: task.input.role, task: task.input.task.split("\n")[0]!, status }} />
    <ActivityTail entries={task.output.activity} total={task.output.activity.length} />
    {status.phase === "finished" && status.message && <p className="type-caption">{status.message}</p>}
    {finished && (task.output.result ? <Markdown>{task.output.result}</Markdown> : <p className="type-caption">{i18n.text(messages.noReport)}</p>)}
    {task.output.undelivered.length > 0 && <section className="flex flex-col gap-1">
      <h4 className="type-caption">{i18n.text(messages.undelivered)}</h4>
      {task.output.undelivered.map((text, index) => <p key={index} className="type-body whitespace-pre-wrap break-words">{text}</p>)}
    </section>}
    <Usage usage={task.output.usage} live={false} />
  </div>;
}
export const checkViews = {
  label: messages.check,
  input: { headerRenderer: CheckHeader },
  execution: { headerRenderer: CheckHeader },
  result: { headerRenderer: CheckHeader, bodyRenderer: CheckBody },
} satisfies ToolRendererDefinition<TaskSnapshot, string>;

/* ---------- wait: streaming status and process of several tasks ---------- */

type WaitProps = ToolRenderProps<{ tasks: WaitEntry[] }, string[]>;
function WaitHeader({ phase, target, result }: WaitProps) {
  const i18n = useI18n(), tasks = result?.data?.tasks;
  const finished = tasks?.filter(task => task.status.phase === "finished").length ?? 0;
  return <ToolHeader label={i18n.text(messages.wait)} monospace
    subject={phase === "input" || !Array.isArray(target) ? undefined : target.join(", ")}
    meta={tasks && i18n.formatMessage(messages.finished, { finished, total: tasks.length })} />;
}
function WaitBody({ phase, result }: WaitProps) {
  const tasks = result?.data?.tasks;
  if (!tasks?.length) return null;
  return <div className="flex min-w-0 flex-col gap-4">{tasks.map(task => <section key={task.id} className="flex min-w-0 flex-col gap-2">
    <TaskLine task={task} />
    {task.status.phase !== "queued" && <ActivityTail entries={task.activity} total={task.steps} />}
    {task.status.phase === "finished" && task.status.message && <p className="type-caption">{task.status.message}</p>}
    <Usage usage={task.usage} live={phase === "executing" && task.status.phase === "running"} />
  </section>)}</div>;
}
export const waitViews = {
  label: messages.wait,
  input: { headerRenderer: WaitHeader },
  execution: { headerRenderer: WaitHeader, bodyRenderer: WaitBody, streaming: ({ result }) => !!result?.data?.tasks.length },
  result: { headerRenderer: WaitHeader, bodyRenderer: WaitBody },
} satisfies ToolRendererDefinition<{ tasks: WaitEntry[] }, string[]>;

/* ---------- steer and cancel ---------- */

type SteerProps = ToolRenderProps<{ id: string; accepted: true }, string, { message: string }>;
function SteerHeader({ phase, target }: SteerProps) {
  return <ToolHeader label={useI18n().text(messages.steer)} subject={phase === "input" ? undefined : target} monospace />;
}
function SteerBody({ phase, args }: SteerProps) {
  return phase === "input" ? null : <p className="type-body whitespace-pre-wrap break-words">{args.message}</p>;
}
export const steerViews = {
  label: messages.steer,
  input: { headerRenderer: SteerHeader },
  execution: { headerRenderer: SteerHeader, bodyRenderer: SteerBody },
  result: { headerRenderer: SteerHeader, bodyRenderer: SteerBody },
} satisfies ToolRendererDefinition<{ id: string; accepted: true }, string, { message: string }>;

type CancelProps = ToolRenderProps<TaskSummary, string, { reason?: string }>;
function CancelHeader({ phase, target, result }: CancelProps) {
  const status = result?.data?.status;
  return <ToolHeader label={useI18n().text(messages.cancel)} subject={phase === "input" ? undefined : target} monospace
    meta={status && <TaskStatus status={status} />} />;
}
function CancelBody({ phase, args }: CancelProps) {
  return phase === "input" || !args.reason ? null : <p className="type-body whitespace-pre-wrap break-words">{args.reason}</p>;
}
export const cancelViews = {
  label: messages.cancel,
  input: { headerRenderer: CancelHeader },
  execution: { headerRenderer: CancelHeader, bodyRenderer: CancelBody },
  result: { headerRenderer: CancelHeader, bodyRenderer: CancelBody },
} satisfies ToolRendererDefinition<TaskSummary, string, { reason?: string }>;
