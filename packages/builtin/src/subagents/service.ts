import { nanoid } from "nanoid";
import { PluginApiError, type ObjectExecutor, type SessionExecutor, type ToolCaller } from "@asterism-app/sdk/runtime";
import type { SessionRecord } from "@asterism-app/sdk/contracts";
import type { ActiveRun } from "./execution.ts";
import type { AuditLog } from "./audit.ts";
import { activityOf } from "./activity.ts";
import {
  Delegation, emptyOutput, ended, summary, subagentParallelism, recentActivity, type DelegateInput, type DelegationInput, type ProcessFrame,
  type TaskCompletion, type TaskSnapshot, type TaskSummary, type WaitEntry,
} from "./contract.ts";

type Entry = { record: SessionRecord; input: DelegationInput; completion: TaskCompletion | null };
interface Job extends ActiveRun {
  recordId: string;
  controller: AbortController;
  done: Promise<void>;
  resolve(): void;
}
interface PoolDependencies {
  object: ObjectExecutor;
  session: SessionExecutor;
  execute(run: ActiveRun, signal: AbortSignal): Promise<TaskCompletion>;
  audit(runId: string): AuditLog;
  changed(): void;
  failed(error: unknown): void;
}

/** The pool owns live execution; completed reports are always read from their Delegation records. */
export class SubagentPoolRuntime {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private readonly active = new Set<Job>();
  private readonly listeners = new Set<(finished: boolean) => void>();
  private nextId = 1;
  private signal: AbortSignal | null = null;
  private closed = false;
  private closing?: Promise<void>;

  constructor(private readonly deps: PoolDependencies) {}
  restore(): void {
    const entries = this.records("session");
    for (const entry of entries) this.nextId = Math.max(this.nextId, Number(entry.input.id.slice(4)) + 1);
    const pending = entries.filter(entry => entry.record.pending);
    if (pending.length) this.deps.session.commit(writer => {
      for (const entry of pending) writer.complete(Delegation, entry.record.id, {
        status: ended("failed", "interrupted", "The previous execution ended before its result was saved."),
        output: emptyOutput(), finishedAt: new Date().toISOString(),
      });
    });
  }
  private records(scope: "timeline" | "session"): Entry[] {
    return this.deps.session.snapshot().records.query(Delegation, { scope }).flatMap(decoded => {
      if (decoded.record.source?.resource?.id !== this.deps.object.ref.id) return [];
      if (decoded.status !== "known") throw new PluginApiError("unavailable", "A delegation record could not be decoded.");
      return [{ record: decoded.record, input: decoded.data.input, completion: decoded.data.output }];
    });
  }
  private require(id: string): Entry {
    const entry = this.records("timeline").find(entry => entry.input.id === id);
    if (!entry) throw new PluginApiError("not_found", `Task ${id} is not on this pool's current timeline.`);
    return entry;
  }
  private snapshot(entry: Entry): TaskSnapshot {
    if (!entry.record.pending && entry.completion)
      return { input: entry.input, status: entry.completion.status, output: entry.completion.output,
        createdAt: entry.record.createdAt, finishedAt: entry.completion.finishedAt };
    const live = this.jobs.get(entry.input.runId);
    if (live) {
      const snapshot = structuredClone({ ...live.snapshot, createdAt: entry.record.createdAt });
      if (live.accepting && live.startedAt !== null) snapshot.output.usage.elapsedMs = Math.round(performance.now() - live.startedAt);
      // Finished jobs kept after a failed save already hold their final activity; buffers are released by then.
      if (live.snapshot.status.phase !== "finished") snapshot.output.activity = activityOf(live.blocks, live.live, live.steers);
      return snapshot;
    }
    throw new PluginApiError("unavailable", `Task ${entry.input.id} has no live execution or saved result.`);
  }
  list(): TaskSummary[] { return this.records("timeline").map(entry => summary(this.snapshot(entry))); }
  check(id: string): TaskSnapshot { return this.snapshot(this.require(id)); }
  process(id: string, offset = 0): ProcessFrame {
    const task = this.check(id), run = this.jobs.get(task.input.runId);
    return { task, blocks: run ? run.blocks.slice(offset) : [], live: run ? [...run.live] : [], error: null };
  }
  get working(): boolean { return this.queue.length > 0 || this.active.size > 0; }
  subscribe(listener: (finished: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  changed(finished = false): void {
    this.deps.changed();
    for (const listener of this.listeners) listener(finished);
  }

  /** A single managed, nonbusy task binds the queue and all active runs to the resource lifetime. */
  async supervise(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return this.close();
    this.signal = signal;
    const stopped = new Promise<void>(resolve => signal.addEventListener("abort", () => {
      void this.close().then(resolve);
    }, { once: true }));
    this.pump();
    await stopped;
  }
  delegate(args: DelegateInput, caller: ToolCaller): TaskSnapshot {
    if (this.closed) throw new PluginApiError("unavailable", "The subagent pool is closing.");
    const input: DelegationInput = { id: `sub-${this.nextId++}`, runId: nanoid(), role: args.role, model: args.model ?? null,
      task: args.task, context: args.context ?? null, submittedBy: { id: caller.ref.id, title: caller.title } };
    let resolve!: () => void;
    const job: Job = {
      snapshot: { input, status: { phase: "queued" }, output: emptyOutput(), createdAt: new Date().toISOString(), finishedAt: null },
      recordId: "", controller: new AbortController(), queue: [], steers: [], accepting: true, startedAt: null, blocks: [], live: [],
      audit: this.deps.audit(input.runId), done: new Promise<void>(accept => { resolve = accept; }), resolve: () => resolve(),
    };
    job.audit.append({ type: "delegation", input });
    try {
      this.deps.object.commit(writer => {
        job.recordId = writer.begin(Delegation, input);
        this.jobs.set(input.runId, job);
      });
    } catch (error) { this.jobs.delete(input.runId); throw error; }
    this.queue.push(job);
    this.changed(); this.pump();
    return this.check(input.id);
  }
  /** Queued and running tasks accept input alike; queue admission is internal to the pool. */
  steer(id: string, message: string): void {
    const entry = this.require(id), job = this.jobs.get(entry.input.runId);
    if (!job?.accepting || job.controller.signal.aborted)
      throw new PluginApiError("conflict", `Task ${id} no longer accepts input.`);
    job.queue.push(message);
    job.audit.append({ type: "steering-queued", message });
    this.changed();
  }
  async cancel(id: string, reason = "The task was cancelled."): Promise<TaskSummary> {
    const entry = this.require(id), job = this.jobs.get(entry.input.runId);
    if (job && job.snapshot.status.phase !== "finished") {
      if (!this.abandon(job, reason)) job.controller.abort(new Error(reason));
      await job.done;
    }
    return summary(this.latest(entry));
  }
  private latest(entry: Entry): TaskSnapshot {
    const current = this.records("session").find(current => current.record.id === entry.record.id);
    if (!current) throw new PluginApiError("not_found", "The delegation record is unavailable.");
    return this.snapshot(current);
  }
  /** Wait for every selected task to end, publishing each task's status and recent process steps as they change. */
  async wait(ids: readonly string[], signal: AbortSignal, publish: (entries: WaitEntry[]) => void = () => {}): Promise<WaitEntry[]> {
    signal.throwIfAborted();
    const entries = [...new Set(ids)].map(id => this.require(id));
    const read = () => entries.map(entry => waitEntry(this.latest(entry)));
    const completion = Promise.all(entries.map(entry => this.jobs.get(entry.input.runId)?.done));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => { timer = undefined; publish(read()); };
    // A finishing task publishes before its runtime buffers are released, so the last process steps are not lost.
    const unsubscribe = this.subscribe(finished => {
      if (finished) { clearTimeout(timer); send(); }
      else timer ??= setTimeout(send, 40);
    });
    try {
      send();
      await new Promise<void>((resolve, reject) => {
        const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        void completion.then(() => { signal.removeEventListener("abort", abort); resolve(); }, error => {
          signal.removeEventListener("abort", abort); reject(error);
        });
      });
      return read();
    } finally { unsubscribe(); clearTimeout(timer); }
  }
  private pump(): void {
    while (!this.closed && this.signal && this.active.size < subagentParallelism && this.queue.length) this.start(this.queue.shift()!);
  }
  private start(job: Job): void {
    this.active.add(job);
    const signal = AbortSignal.any([this.signal!, job.controller.signal]);
    void this.run(job, signal).then(completion => this.finalize(job, completion)).finally(() => {
      this.active.delete(job);
      this.pump();
    });
  }
  private async run(job: Job, signal: AbortSignal): Promise<TaskCompletion> {
    try { return await this.deps.execute(job, signal); }
    catch (error) {
      this.deps.failed(error);
      return { status: ended("failed", "execution_failed", error instanceof Error ? error.message : String(error)),
        output: job.snapshot.output, finishedAt: new Date().toISOString() };
    }
  }
  /** End a task that never left the queue: it records a cancelled outcome without execution or audit. */
  private abandon(job: Job, reason: string): boolean {
    const index = this.queue.indexOf(job);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    job.controller.abort(new Error(reason));
    this.finalize(job, { status: ended("cancelled", "cancelled", reason),
      output: { ...job.snapshot.output, undelivered: job.queue.splice(0) }, finishedAt: new Date().toISOString() });
    return true;
  }
  /** Sole completion path: fill the Delegation record, publish the final state, and release runtime buffers. */
  private finalize(job: Job, completion: TaskCompletion): void {
    job.accepting = false;
    let saved = false;
    try {
      this.deps.session.commit(writer => { writer.complete(Delegation, job.recordId, completion); });
      Object.assign(job.snapshot, completion);
      saved = true;
    } catch (error) {
      job.snapshot.status = ended("failed", "finalization_failed", error instanceof Error ? error.message : String(error));
      job.snapshot.finishedAt = new Date().toISOString();
      this.deps.failed(error);
    } finally {
      this.changed(true);
      job.blocks = []; job.live = []; job.queue = []; job.steers = [];
      if (saved) this.jobs.delete(job.snapshot.input.runId);
      job.resolve();
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const reason = "The subagent pool was closed.";
    for (const job of [...this.queue]) this.abandon(job, reason);
    for (const job of this.active) job.controller.abort(new Error(reason));
    return this.closing = Promise.all([...this.jobs.values()].map(job => job.done)).then(() => {});
  }
}

function waitEntry(task: TaskSnapshot): WaitEntry {
  const { activity } = task.output;
  return { ...summary(task), activity: activity.slice(-recentActivity), steps: activity.length };
}
