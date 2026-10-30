import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { VList } from "virtua";
import { ArrowLeft, CircleSlash, Send, Square } from "lucide-react";
import { useI18n, useRendererCalls, useRendererObject } from "@asterism-app/sdk/renderer";
import { cn } from "@asterism-app/ui/utils";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@asterism-app/ui/ui/alert";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@asterism-app/ui/ui/input-group";
import { Popover, PopoverContent, PopoverDescription, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { Markdown } from "../agent/conversation/Markdown";
import { Disclosure } from "../agent/conversation/Disclosure";
import { subagentMessages as messages } from "../messages/subagents";
import { PoolChannel, CancelSubagent, SteerSubagent, type FinishedStatus, type TaskSnapshot, type TaskSummary, type ProcessFrame } from "./contract";
import { ActivityList, InstructionList } from "./ActivityTail";
import { TaskStatus, Usage, stateTones } from "./task-parts";

const shortcut = "⌘ / Ctrl + Enter";

/** Model, usage, and submitter; elapsed time counts while the task is executing. */
function TaskMeta({ task }: { task: TaskSnapshot }) {
  const i18n = useI18n();
  const from = i18n.formatMessage(messages.submittedBy, { title: task.input.submittedBy.title });
  if (task.status.phase === "queued") return <p className="type-caption">{from}</p>;
  const live = task.status.phase === "running" && task.status.activity !== "finalizing";
  return <Usage usage={task.output.usage} live={live} extra={[from]} />;
}

/** Why a task did not succeed, shown before its report. */
function Outcome({ status }: { status: FinishedStatus }) {
  const i18n = useI18n();
  if (status.outcome === "succeeded") return null;
  const tone = stateTones[status.outcome];
  return <Alert role="status" variant={status.outcome === "failed" ? "destructive" : "default"}
    className={cn("px-3 py-2", status.outcome === "partial" && "[&>svg]:text-warning")}>
    <StatusIcon tone={tone} icon={status.outcome === "cancelled" ? CircleSlash : undefined} />
    <AlertTitle>{i18n.formatMessage(messages.state, { state: status.outcome })}</AlertTitle>
    {status.message && <AlertDescription className="break-words">{status.message}</AlertDescription>}
  </Alert>;
}

function Section({ title, children, ref }: { title: string; children: ReactNode; ref?: Ref<HTMLElement> }) {
  return <section ref={ref} className="flex min-w-0 flex-col gap-2"><h3 className="type-label">{title}</h3>{children}</section>;
}

function TaskDetail({ id, back, focus }: { id: string; back(): void; focus: boolean }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n();
  const openChannel = useRef(object.openChannel); openChannel.current = object.openChannel;
  const [frame, setFrame] = useState<ProcessFrame | null>(null);
  const [connection, setConnection] = useState(0), [disconnected, setDisconnected] = useState(false);
  const [text, setText] = useState(""), [pending, setPending] = useState<"cancel" | "steer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false), [backgroundOpen, setBackgroundOpen] = useState(false);
  const scroll = useRef<HTMLDivElement>(null), report = useRef<HTMLElement>(null);
  /** Whether the reader stays at the end of the page, so new steps and the final report follow into view. */
  const pinned = useRef(false);
  const phase = useRef<string | null>(null);

  useEffect(() => {
    const channel = openChannel.current(PoolChannel);
    let active = true;
    const unsubscribe = channel.onMessage(value => { if (active) setFrame(value); });
    channel.send({ id });
    void channel.closed.then(() => { if (active) setDisconnected(true); });
    return () => { active = false; unsubscribe(); channel.close(); };
  }, [id, object.ref.id, object.ref.sessionId, connection]);
  const reconnect = () => { setDisconnected(false); setConnection(value => value + 1); };

  const task = frame?.task;
  useEffect(() => {
    const element = scroll.current, previous = phase.current;
    phase.current = task?.status.phase ?? null;
    if (!element || !pinned.current) return;
    if (previous === "running" && task?.status.phase === "finished" && report.current) element.scrollTop = report.current.offsetTop;
    else element.scrollTop = element.scrollHeight;
  }, [frame, task]);

  const working = task && (task.status.phase === "queued" || (task.status.phase === "running" && task.status.activity !== "finalizing"));
  const blocked = !!pending || disconnected || !object.view.ready;
  const act = async (action: "cancel" | "steer") => {
    if (pending) return;
    setPending(action); setError(null);
    try {
      if (action === "cancel") await calls.invoke(CancelSubagent, { id }, { object: object.ref });
      else {
        const message = text;
        await calls.invoke(SteerSubagent, { id, message }, { object: object.ref });
        setText(current => current === message ? "" : current); pinned.current = true;
      }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPending(null); }
  };
  const steer = () => { if (text.trim() && !blocked) void act("steer"); };
  const instructions = task?.status.phase === "finished"
    && (task.output.activity.some(entry => entry.kind === "steer") || task.output.undelivered.length > 0);

  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <header className="flex min-w-0 items-center gap-2 border-b px-2 py-1.5">
      <Button size="icon-sm" variant="ghost" aria-label={i18n.text(messages.back)} title={i18n.text(messages.back)}
        autoFocus={focus} onClick={back}><ArrowLeft /></Button>
      <span className="shrink-0 font-mono text-xs">{id}</span>
      <span className="min-w-0 flex-1 truncate type-caption">{task?.input.role}</span>
      {task && <TaskStatus status={task.status} />}
      {working && <Popover open={confirming} onOpenChange={setConfirming}>
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={i18n.text(messages.cancel)} title={i18n.text(messages.cancel)}
            disabled={blocked}><Square /></Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-64 flex-col gap-3 p-3 text-sm">
          <PopoverDescription>{i18n.text(messages.cancelConfirm)}</PopoverDescription>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{i18n.text(messages.keepRunning)}</Button>
            <Button size="sm" variant="destructive" disabled={blocked}
              onClick={() => { setConfirming(false); void act("cancel"); }}>{i18n.text(messages.cancel)}</Button>
          </div>
        </PopoverContent>
      </Popover>}
    </header>

    <div ref={scroll} className="content-scrollbar relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3"
      onScroll={event => {
        const element = event.currentTarget;
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}>
      {disconnected && <Alert variant="destructive" className="px-3 py-2">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          {i18n.text(messages.disconnected)}
          <Button size="xs" variant="outline" onClick={reconnect}>{i18n.text(messages.reconnect)}</Button>
        </AlertDescription>
      </Alert>}
      {frame?.error && <Alert className="px-3 py-2"><AlertDescription>{i18n.text(messages.unavailable)}</AlertDescription></Alert>}
      {!frame && !disconnected && <div className="flex justify-center py-6"><Spinner className="text-muted-foreground" /></div>}
      {task && <>
        <Section title={i18n.text(messages.task)}>
          <Markdown>{task.input.task}</Markdown>
          <TaskMeta task={task} />
        </Section>
        {task.input.context && <Disclosure open={backgroundOpen} onOpenChange={setBackgroundOpen}
          header={<span className="type-label">{i18n.text(messages.background)}</span>}>
          <Markdown>{task.input.context}</Markdown>
        </Disclosure>}
        {task.status.phase !== "finished" && (task.output.activity.length > 0 || (frame?.queued.length ?? 0) > 0)
          && <Section title={i18n.text(messages.process)}>
            <ActivityList entries={task.output.activity} queued={frame?.queued} />
          </Section>}
        {task.status.phase === "finished" && <Section ref={report} title={i18n.text(messages.report)}>
          <Outcome status={task.status} />
          {task.output.result ? <Markdown>{task.output.result}</Markdown> : <p className="type-caption">{i18n.text(messages.noReport)}</p>}
        </Section>}
        {instructions && <Section title={i18n.text(messages.steering)}>
          <InstructionList activity={task.output.activity} undelivered={task.output.undelivered} />
        </Section>}
      </>}
      {error && <p role="alert" className="type-caption text-destructive break-words">{error}</p>}
    </div>

    {working && <form className="border-t p-2" onSubmit={event => { event.preventDefault(); steer(); }}>
      <InputGroup data-disabled={blocked ? "true" : undefined}>
        <InputGroupTextarea value={text} rows={1} aria-label={i18n.text(messages.steer)}
          placeholder={i18n.text(messages.instructions)} disabled={disconnected}
          className="max-h-32 min-h-0 py-2 text-xs md:text-xs"
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); steer(); }
          }} />
        <InputGroupAddon align="inline-end" className="self-end">
          <InputGroupButton type="submit" size="icon-xs" disabled={blocked || !text.trim()}
            aria-label={i18n.text(messages.steer)} title={i18n.formatMessage(messages.send, { shortcut })}>
            {pending === "steer" ? <Spinner className="size-3.5" /> : <Send />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>}
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
  /** Focus moves into the details only when the user opens them, not when a retained selection is restored. */
  const [opened, setOpened] = useState(false);
  const direction = useRef<1 | -1>(1);
  const select = (id: string | null) => {
    direction.current = id === null ? -1 : 1;
    retained.id = id; setSelected(id); setOpened(id !== null);
  };
  const running = data.tasks.filter(task => task.status.phase === "running").length;
  const queued = data.tasks.filter(task => task.status.phase === "queued").length;
  return <div className="nodrag nopan relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
      <PoolPage key={selected ? `task:${selected}` : "list"} direction={direction.current}>
        {selected ? <TaskDetail id={selected} back={() => select(null)} focus={opened} /> : <>
          <p className="type-caption px-3 py-2" role="status" aria-atomic="true">{i18n.formatMessage(messages.active, { running, queued })}</p>
          {data.tasks.length ? <ItemGroup className="min-h-0 flex-1"><VList className="content-scrollbar" data={data.tasks.toReversed()}>{task =>
              <ListRow key={task.id} title={`${task.id} · ${task.role}`} onOpen={() => select(task.id)}
                className="gap-2 px-3 py-1.5 [&_[data-slot=item-title]]:text-xs [&_[data-slot=item-description]]:text-xs [&_[data-slot=item-description]]:leading-snug"
                contentClassName="gap-0.5"
                description={<span className="block truncate" title={task.task}>{task.task}</span>}
                actions={<TaskStatus status={task.status} />} />}</VList></ItemGroup>
            : <p className="type-caption p-3">{i18n.text(messages.empty)}</p>}
        </>}
      </PoolPage>
    </AnimatePresence>
  </div>;
}
