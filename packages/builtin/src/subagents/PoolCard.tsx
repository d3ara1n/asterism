import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { VList } from "virtua";
import { ArrowLeft, Send, Square, Wrench } from "lucide-react";
import { useI18n, useRendererCalls, useRendererObject } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { JsonView } from "@asterism-app/ui/json-view";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Markdown } from "../agent/conversation/Markdown";
import { ConversationTimeline } from "../agent/conversation/ConversationTimeline";
import { Disclosure } from "../agent/conversation/Disclosure";
import { savedTimelineBlock, type TimelineItem } from "../agent/conversation/timeline";
import { subagentMessages as messages } from "../messages/subagents";
import { PoolChannel, CancelSubagent, SteerSubagent, type TaskSnapshot, type TaskSummary, type ProcessFrame } from "./contract";

function stateOf(status: TaskSnapshot["status"]) { return status.phase === "finished" ? status.outcome : status.phase; }
function Activity({ status }: { status: TaskSnapshot["status"] }) {
  const i18n = useI18n();
  if (status.phase !== "running") return null;
  const tool = status.activity.startsWith("tool:") ? status.activity.slice(5) : "";
  return <>{i18n.formatMessage(messages.activity, { activity: tool ? "tool" : status.activity, tool })}</>;
}
const tones: Record<ReturnType<typeof stateOf>, StatusTone> = {
  queued: "neutral", running: "progress", succeeded: "success", partial: "warning", failed: "error", cancelled: "neutral",
};
export function TaskStatus({ status }: { status: TaskSnapshot["status"] }) {
  const state = stateOf(status);
  return <StatusBadge tone={tones[state]}>{useI18n().formatMessage(messages.state, { state })}</StatusBadge>;
}
/** Status at one moment, such as a snapshot read; plain text so it does not read as live. */
export function TaskStateText({ status }: { status: TaskSnapshot["status"] }) {
  return <span className="type-caption">{useI18n().formatMessage(messages.state, { state: stateOf(status) })}</span>;
}
function TaskReport({ task }: { task: TaskSnapshot }) {
  const i18n = useI18n();
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2"><TaskStatus status={task.status} />
      <span className="type-caption">{task.input.id} · {task.input.role}</span><span className="type-caption"><Activity status={task.status} /></span></div>
    <p className="type-caption">{task.output.usage.model ?? ""}
      {" · "}{i18n.formatMessage(messages.usage, { requests: task.output.usage.requests, seconds: Math.round(task.output.usage.elapsedMs / 1000) })}</p>
    {task.status.phase === "finished" && task.status.message && <p className="type-caption">{task.status.message}</p>}
    {task.output.result ? <Markdown>{task.output.result}</Markdown> : <p className="type-caption">{i18n.text(messages.noReport)}</p>}
  </div>;
}

const ProcessTool = memo(function ProcessTool({ item }: { item: Extract<TimelineItem, { kind: "toolcall" }> }) {
  const [open, setOpen] = useState(false);
  const outcome = "outcome" in item ? item.outcome : null;
  const args = item.arguments;
  const name = item.name === "resource_call" && args && typeof args === "object" && !Array.isArray(args) && typeof args.tool === "string"
    ? args.tool : item.name;
  return <Disclosure open={open} onOpenChange={setOpen} header={<><Wrench className="size-3.5" /><ToolHeader label={name} /></>}>
    <div className="flex flex-col gap-2"><JsonView value={args} />{outcome && <JsonView value={outcome} />}</div>
  </Disclosure>;
});
function Process({ frame }: { frame: ProcessFrame }) {
  const saved = useMemo(() => {
    const responseOrder = new Map<string, number>();
    for (const block of frame.blocks) if (!responseOrder.has(block.responseId)) responseOrder.set(block.responseId, responseOrder.size);
    return [...frame.blocks].sort((a, b) => responseOrder.get(a.responseId)! - responseOrder.get(b.responseId)! || a.ordinal - b.ordinal)
      .map(block => savedTimelineBlock({ id: `${block.responseId}:${block.ordinal}`, createdAt: "" }, block));
  }, [frame.blocks]);
  const keys = new Set(saved.map(block => block.id));
  const items: TimelineItem[] = [...saved, ...frame.live.filter(block => !keys.has(block.id))];
  return <div className="flex min-w-0 flex-col gap-3">
    {items.map(item => <div key={"responseId" in item ? `${item.responseId}:${item.ordinal}` : item.id}>
      {item.kind === "toolcall" ? <ProcessTool item={item} /> : <ConversationTimeline items={[item]} />}
    </div>)}
  </div>;
}

function TaskDetail({ id, back }: { id: string; back(): void }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n();
  const openChannel = useRef(object.openChannel); openChannel.current = object.openChannel;
  const [frame, setFrame] = useState<ProcessFrame | null>(null);
  const [error, setError] = useState<string | null>(null), [disconnected, setDisconnected] = useState(false);
  const [text, setText] = useState(""), [pending, setPending] = useState<"cancel" | "steer" | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const fieldId = useId();
  useEffect(() => {
    const channel = openChannel.current(PoolChannel);
    let active = true;
    const unsubscribe = channel.onMessage(value => {
      if (active) setFrame(previous => ({ ...value, blocks: value.reset || !previous ? value.blocks
        : value.blocks.length ? [...previous.blocks, ...value.blocks] : previous.blocks }));
    });
    channel.send({ id });
    void channel.closed.then(() => { if (active) setDisconnected(true); });
    return () => { active = false; unsubscribe(); channel.close(); };
  }, [id, object.ref.id, object.ref.sessionId]);
  const task = frame?.task;
  const working = task && (task.status.phase === "queued" || (task.status.phase === "running" && task.status.activity !== "finalizing"));
  const act = async (action: "cancel" | "steer") => {
    if (pending) return;
    setPending(action); setError(null); setDelivered(false);
    try {
      if (action === "cancel") await calls.invoke(CancelSubagent, { id }, { object: object.ref });
      else {
        await calls.invoke(SteerSubagent, { id, message: text }, { object: object.ref });
        setText(""); setDelivered(true);
      }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPending(null); }
  };
  return <div className="nodrag nopan content-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">
    <div className="flex items-center justify-between gap-2">
      <Button size="sm" variant="ghost" onClick={back}><ArrowLeft />{i18n.text(messages.back)}</Button>
      {working && <IconButton label={i18n.text(messages.cancel)} size="icon-sm" disabled={!!pending || disconnected || !object.view.ready}
        onClick={() => void act("cancel")}><Square /></IconButton>}
    </div>
    {disconnected && <p role="alert" className="type-caption">{i18n.text(messages.disconnected)}</p>}
    {frame?.error && <p role="alert" className="type-caption">{i18n.text(messages.unavailable)}</p>}
    {task && <>
      <section className="flex flex-col gap-2"><h3 className="type-label">{i18n.text(messages.task)}</h3>
        <p className="type-body whitespace-pre-wrap break-words">{task.input.task}</p></section>
      {task.input.context && <Disclosure open={backgroundOpen} onOpenChange={setBackgroundOpen} header={<span>{i18n.text(messages.background)}</span>}>
        <Markdown>{task.input.context}</Markdown>
      </Disclosure>}
      <section className="flex flex-col gap-2"><h3 className="type-label">{i18n.text(messages.report)}</h3><TaskReport task={task} /></section>
      {working && <form onSubmit={event => { event.preventDefault(); if (text.trim()) void act("steer"); }}>
        <FieldGroup><Field><FieldLabel htmlFor={fieldId}>{i18n.text(messages.instructions)}</FieldLabel>
          <Textarea id={fieldId} value={text} onChange={event => setText(event.target.value)} disabled={!!pending || disconnected} rows={3} /></Field>
          <Button type="submit" size="sm" className="w-fit" disabled={!!pending || !text.trim() || disconnected || !object.view.ready}>
            <Send />{i18n.text(messages.steer)}</Button></FieldGroup>
      </form>}
      {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
      {delivered && <p role="status" className="type-caption">{i18n.text(messages.delivered)}</p>}
      {frame && (frame.blocks.length > 0 || frame.live.length > 0) && <section className="flex flex-col gap-3">
        <h3 className="type-label">{i18n.text(messages.process)}</h3><Process frame={frame} />
      </section>}
    </>}
  </div>;
}

const pageVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 8 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0, 0, 0.2, 1] } },
  exit: (direction: number) => ({
    opacity: 0, x: direction * -8, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  } as const),
} as const;

function PoolPage({ children, direction, ref }: { children: ReactNode; direction: number; ref?: Ref<HTMLDivElement> }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <motion.div ref={ref} inert={!present} custom={direction}
    variants={pageVariants} initial={reducedMotion ? false : "enter"}
    animate={reducedMotion ? { opacity: 1, x: 0, transition: { duration: 0 } } : "center"}
    exit={reducedMotion ? { opacity: 0, x: 0, transition: { duration: 0 } } : "exit"}
    className="flex min-h-0 min-w-0 flex-1 flex-col">
    {children}
  </motion.div>;
}

export function PoolCard({ data }: { data: { tasks: TaskSummary[] } }) {
  const object = useRendererObject(), i18n = useI18n();
  const retained = object.retained.get("asterism.builtin/subagent-selection", () => ({ id: null as string | null }));
  const [selected, setSelected] = useState(retained.id);
  const direction = useRef<1 | -1>(1);
  const select = (id: string | null) => {
    direction.current = id === null ? -1 : 1;
    retained.id = id; setSelected(id);
  };
  const running = data.tasks.filter(task => task.status.phase === "running").length;
  const queued = data.tasks.filter(task => task.status.phase === "queued").length;
  return <div className="nodrag nopan relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
      <PoolPage key={selected ? `task:${selected}` : "list"} direction={direction.current}>
        {selected ? <TaskDetail id={selected} back={() => select(null)} /> : <>
          <p className="type-caption px-3 py-2" role="status" aria-atomic="true">{i18n.formatMessage(messages.active, { running, queued })}</p>
          {data.tasks.length ? <ItemGroup className="min-h-0 flex-1"><VList className="content-scrollbar" data={data.tasks.toReversed()}>{task =>
              <ListRow key={task.id} title={`${task.id} · ${task.role}`} onOpen={() => select(task.id)}
                className="gap-2 px-3 py-1.5 [&_[data-slot=item-title]]:text-xs [&_[data-slot=item-description]]:text-xs [&_[data-slot=item-description]]:leading-snug"
                contentClassName="gap-0.5"
                description={<span className="block truncate" title={task.task}>{task.task}</span>}
                details={task.status.phase === "running" ? <Activity status={task.status} /> : undefined}
                actions={<TaskStatus status={task.status} />} />}</VList></ItemGroup>
            : <p className="type-caption p-3">{i18n.text(messages.empty)}</p>}
        </>}
      </PoolPage>
    </AnimatePresence>
  </div>;
}
