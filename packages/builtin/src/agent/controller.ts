import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices, type ExecutionServices, type ProviderUsage } from "@asterism-app/sdk/runtime";
import { ResourceStatusChanged, describeError, formatModelExpression, type ResourceStatus, type ModelRunObserver, type ModelRunResult } from "@asterism-app/sdk/contracts";
import { Execution, ToolExecution, AgentTurnEnded, type AgentTurnEndReason } from "@asterism-app/builtin-api/contracts";
import { runAgentLoop } from "./loop.ts";
import { agentRequestRetries } from "./retry.ts";
import { agentRequestExtensions } from "./request-context.ts";
import { feedbackOrigin } from "./feedback.ts";
import type { createAgentFeedback } from "./feedback-state.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { createRequestAssembly } from "./preparation.ts";
import { projectAgentContext, projectForAgent } from "./projection.ts";
import { compressContext, compressionDue, estimateContext, planCompression, type PreparedCompression } from "./compression.ts";
import { projectAgentTurnState } from "./state-projection.ts";
import { deliverDrafts } from "./drafts.ts";
import { turnStartRead } from "./input-message.ts";
import { readRecords } from "../shared/record-reading.ts";

interface AgentControllerDependencies {
  selection: AgentSelectionService;
  tasks: PluginTasks;
  models: ModelServices;
  execution: ExecutionServices;
  prepareRequest: ReturnType<typeof createRequestAssembly>;
  userAgent: string;
  usage?: Pick<ProviderUsage, "consume">;
  feedback: ReturnType<typeof createAgentFeedback>;
}

/** Bind the Agent loop to resource scheduling, timeline records, persistent drafts, and workbench feedback. */
export function createAgentController(deps: AgentControllerDependencies) {
  // One owned task accepts inputs at a time; task cleanup remains tracked by the host lifecycle.
  const active = new Map<string, { key: string; entered: boolean; end(reason: AgentTurnEndReason): void }>();
  const waiters = new Map<string, Set<() => void>>();
  // Conversation and compression exits both release callers waiting for this Agent to settle.
  const finish = (id: string) => {
    active.delete(id);
    const pending = waiters.get(id);
    waiters.delete(id);
    for (const wake of pending ?? []) wake();
  };
  let execution = 0;
  const running = (object: ObjectReader) => {
    const run = active.get(object.ref.id);
    return !!run && deps.tasks.has(run.key);
  };
  const idle = (object: ObjectReader) => {
    if (running(object)) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
  };
  const publish = (object: ObjectExecutor, status: ResourceStatus["status"]) => object.events.publish(ResourceStatusChanged, {
    title: object.snapshot()!.title, status,
  });
  const report = (object: ObjectExecutor, error: unknown, signal: AbortSignal, interrupted: boolean) => {
    if (signal.aborted) {
      if (interrupted) deps.feedback.report(object, { origin: "model", level: "warning", code: "cancelled", message: "Execution was cancelled." }, true);
      return;
    }
    const details = describeError(error);
    deps.feedback.report(object, { origin: feedbackOrigin(error), level: "error",
      code: error instanceof PluginApiError ? error.code : "execution_failed",
      message: error instanceof Error ? error.message : details.message, details }, interrupted);
  };
  // Task registration is synchronous; callers check their domain conditions before handing off owned work.
  const startTask = (object: ObjectExecutor, kind: "conversation" | "compression",
    work: (signal: AbortSignal) => Promise<AgentTurnEndReason>,
    ended: (reason: AgentTurnEndReason, entered: boolean) => () => void) => {
    const run = {
      key: `agent:${object.ref.id}:${++execution}`, entered: false,
      end(reason: AgentTurnEndReason) {
        const notify = ended(reason, run.entered);
        finish(object.ref.id);
        object.invalidate();
        notify();
      },
    };
    active.set(object.ref.id, run);
    let started: boolean;
    try { started = deps.tasks.start(run.key, async signal => {
      run.entered = true;
      let reason: AgentTurnEndReason = "failed";
      try {
        publish(object, "running");
        reason = await work(signal);
      } catch (error) {
        reason = signal.aborted ? "cancelled" : "failed";
        report(object, error, signal, kind === "conversation");
      } finally { run.end(reason); }
    }, { object: object.ref }); }
    catch (error) { run.end("failed"); throw error; }
    if (!started) {
      run.end("failed");
      throw new PluginApiError("unavailable", "The agent task could not be started.");
    }
    object.invalidate();
  };
  const compressionContext = (object: ObjectReader) => {
    const selection = selectionOf(object).selection;
    const target = deps.selection.target(selection);
    const { system } = deps.prepareRequest(deps.selection.agent(selection), target)();
    const systemTokens = Math.ceil(system.blocks.reduce((size, block) => size + block.text.length, 0) / 4);
    const context = projectAgentContext(object.session.snapshot(), object.ref.id);
    const tokensBefore = estimateContext(context, object.ref.id, formatModelExpression(target), systemTokens);
    return { target, context, tokensBefore };
  };
  const compress = (object: ObjectExecutor, target: ReturnType<AgentSelectionService["target"]>, input: PreparedCompression, signal: AbortSignal) =>
    compressContext(object, target, input, deps.models, signal, deps.userAgent, () => deps.feedback.beginCompression(object));
  const maybeCompact = async (object: ObjectExecutor, signal: AbortSignal) => {
    signal.throwIfAborted();
    const { target, context, tokensBefore } = compressionContext(object);
    const window = deps.models.list().find(entry => entry.model === formatModelExpression(target))?.contextWindow;
    if (!compressionDue(tokensBefore, window)) return;
    const plan = planCompression(context);
    if (plan) await compress(object, target, { plan, tokensBefore }, signal);
  };
  return {
    running,
    /** Waits for the current conversation or compression task to exit. Later input may start another task. */
    settled(object: ObjectReader, signal: AbortSignal): Promise<void> {
      signal.throwIfAborted();
      if (!running(object)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const set = waiters.get(object.ref.id) ?? new Set<() => void>();
        waiters.set(object.ref.id, set);
        const abort = () => { set.delete(wake); reject(signal.reason); };
        const wake = () => { signal.removeEventListener("abort", abort); resolve(); };
        set.add(wake);
        signal.addEventListener("abort", abort, { once: true });
      });
    },
    cancel(object: ObjectExecutor) {
      const run = active.get(object.ref.id);
      if (!run) return;
      deps.tasks.cancel(run.key);
      // A task cancelled before entry never reaches its body's finally.
      if (!run.entered) run.end("cancelled");
    },
    /** Starts a context-only interlude. No eligible prefix is a normal no-op, not a task or a turn. */
    compact(object: ObjectExecutor): boolean {
      idle(object);
      const { target, context, tokensBefore } = compressionContext(object);
      const plan = planCompression(context);
      if (!plan) return false;
      const turn = projectAgentTurnState(object.session.snapshot(), object.ref.id, deps.feedback.get(object).interruptions);
      startTask(object, "compression", async signal => {
        const completed = await compress(object, target, { plan, tokensBefore }, signal);
        return completed ? "completed" : "failed";
      }, (reason, entered) => {
        if (!entered) deps.feedback.beginCompression(object)(reason === "cancelled" ? "cancelled" : "failed");
        return () => publish(object, turn === "completed" ? "completed" : "awaiting");
      });
      return true;
    },
    start(object: ObjectExecutor) {
      idle(object);
      const boundary = () => {
        const snapshot = object.session.snapshot();
        const input = readRecords(turnStartRead(object.ref.id), snapshot.records.all);
        return { inputId: input?.id ?? null, position: snapshot.position };
      };
      startTask(object, "conversation", async signal => {
        return runAgentLoop({
          retry: {
            maxRetries: agentRequestRetries,
            requesting: attempt => deps.feedback.activity(object, attempt ? { attempt, max: agentRequestRetries, resumeAt: null } : null),
            waiting: (attempt, resumeAt) => deps.feedback.activity(object, { attempt, max: agentRequestRetries, resumeAt }),
          },
          consume: () => deliverDrafts(object, "request"),
          nextTurn(reason) {
            const ended = boundary();
            if (!deliverDrafts(object, "turn")) return false;
            object.events.publish(AgentTurnEnded, { ...ended, reason, settled: false });
            return true;
          },
          completed: async current => { await maybeCompact(object, current); },
          async request(_index, current) {
            // Preparation failures end execution before consuming another input.
            await maybeCompact(object, current);
            const selection = selectionOf(object).selection, agent = deps.selection.agent(selection);
            const snapshot = object.session.snapshot();
            const toolRecords = new Map<string, string>();
            const observer: ModelRunObserver = {
              event(event) {
                if (event.type === "progress") return;
                if (event.type === "diagnostic") {
                  deps.feedback.report(object, { origin: event.origin, code: event.code, message: event.message, level: event.level,
                    ...(event.details ? { details: event.details } : {}),
                    ...(event.responseId ? { responseId: event.responseId } : {}) }, event.level === "error" || event.code === "cancelled");
                  return;
                }
                object.commit(writer => {
                  if (event.type === "tool.begin") toolRecords.set(event.block.callId, writer.begin(ToolExecution, event.block));
                  else if (event.type === "tool.complete") writer.complete(ToolExecution, toolRecords.get(event.block.callId)!, event.block.outcome!);
                  else writer.append(Execution, event);
                });
              },
            };
            let result: ModelRunResult;
            try {
              const target = deps.selection.target(selection);
              const prepare = deps.prepareRequest(agent, target);
              let prepared: ReturnType<typeof prepare>;
              result = await deps.execution.withProgress(object.ref, progress => deps.execution.run({ access: object.ref, interactive: true, requestParentId: snapshot.position.nodeId,
                agent: agent.id, resources: { allow: agent.resources ?? undefined, exclude: agent.excludeResources ?? undefined },
                userAgent: deps.userAgent, completionExtensions: context => agentRequestExtensions(prepared.blocks, context),
                target, system: files => { prepared = prepare(files); return prepared.system; }, messages: projectForAgent(snapshot, object.ref.id), signal: current,
                observer: { event(event) { progress.event(event); return observer.event(event); } },
              }));
            } catch (error) {
              report(object, error, current, true);
              return { reason: current.aborted ? "cancelled" : "failed", hasTools: false };
            }
            if (result.response) deps.usage?.consume(result.response);
            if (result.reason === "failed" && result.code === "event_delivery") {
              deps.feedback.report(object, { origin: "software", level: "error", code: "event_delivery",
                message: "The model response could not be saved to the timeline. Execution stopped.",
                ...(result.details ? { details: result.details } : {}) }, true);
              return { reason: "failed", hasTools: false, halt: true };
            }
            return { reason: result.reason, hasTools: result.tools.length > 0,
              ...(result.reason === "failed" ? { retryable: result.retryable, details: result.details } : {}) };
          },
        }, signal);
      }, (reason, entered) => {
        if (!entered && reason === "cancelled")
          deps.feedback.report(object, { origin: "model", level: "warning", code: "cancelled", message: "Execution was cancelled." }, true);
        deps.feedback.activity(object, null);
        const ended = boundary();
        return () => {
          publish(object, reason === "completed" || reason === "failed" ? reason : "awaiting");
          object.events.publish(AgentTurnEnded, { ...ended, reason, settled: true });
        };
      });
    },
  };
}
