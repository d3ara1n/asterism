import { useEffect, useState } from "react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ActivityTail } from "./ActivityTail";
import { Markdown } from "../agent/conversation/Markdown";
import { subagentMessages as messages } from "../messages/subagents";
import { TaskStateText, TaskStatus } from "./PoolCard";
import type { DelegateInput, TaskSnapshot, TaskSummary, WaitEntry } from "./contract";
import { currentActivity } from "./activity";

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
/** Status line identifying one task: ID, role, status, and the task's first line. Snapshots show the status as text. */
function TaskLine({ task, snapshot = false }: { task: Pick<TaskSummary, "id" | "role" | "task" | "status">; snapshot?: boolean }) {
  return <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0 font-mono">{task.id}</span>
    <span className="shrink-0 type-caption">{task.role}</span>
    <span className="min-w-0 flex-1 truncate" title={task.task}>{task.task}</span>
    {snapshot ? <TaskStateText status={task.status} /> : <TaskStatus status={task.status} />}
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
    meta={status && <TaskStateText status={status} />} />;
}
function CheckBody({ result }: CheckProps) {
  const i18n = useI18n(), task = result?.data;
  if (!task) return null;
  const { status } = task, finished = status.phase === "finished";
  const current = currentActivity(task);
  const tool = current?.activity.startsWith("tool:") ? current.activity.slice(5) : "";
  return <div className="flex min-w-0 flex-col gap-3">
    <TaskLine snapshot task={{ id: task.input.id, role: task.input.role, task: task.input.task.split("\n")[0]!, status }} />
    {current && <p className="type-caption">
      {i18n.formatMessage(messages.activity, { activity: tool ? "tool" : current.activity, tool })}
      {current.subject && <> · <span className="font-mono">{current.subject}</span></>}
    </p>}
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
    {phase === "executing" && task.status.phase === "running" && <>
      <ActivityTail entries={task.activity} total={task.steps} />
      <Usage usage={task.usage} live />
    </>}
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
    meta={status && <TaskStateText status={status} />} />;
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
