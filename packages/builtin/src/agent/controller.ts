import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices, type ExecutionServices, type ProviderUsage } from "@asterism-app/sdk/runtime";
import { ResourceStatusChanged, describeError, type ResourceStatus, type ModelRunObserver, type ModelRunResult } from "@asterism-app/sdk/contracts";
import { Execution } from "@asterism-app/builtin-api/contracts";
import { runAgentLoop } from "./loop.ts";
import { agentRequestExtensions } from "./request-context.ts";
import { feedbackOrigin } from "./feedback.ts";
import type { createAgentFeedback } from "./feedback-state.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { createRequestAssembly } from "./preparation.ts";
import { projectForAgent } from "./projection.ts";
import { compressContext } from "./compression.ts";
import { deliverDrafts } from "./drafts.ts";

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
  // Resource input acceptance relies on a loop that still consumes messages; later host-task cleanup remains tracked by its lifecycle.
  const active = new Map<string, { key: string; entered: boolean }>();
  const waiters = new Map<string, Set<() => void>>();
  // All loop exits (normal completion, failure, cancellation, or failure to start) remove the run here and wake callers waiting for this agent to settle.
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
  return {
    running,
    /** Waits for the current execution loop to exit, resolving immediately when not running. Input delivered after exit starts a new loop, which callers can wait for again as needed. */
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
      // If the host receives cancellation before invoking the task body, the task body's finally is never entered.
      if (!run.entered) {
        deps.feedback.report(object, { origin: "model", level: "warning", code: "cancelled", message: "Execution was cancelled." }, true);
        finish(object.ref.id); object.invalidate();
      }
    },
    start(object: ObjectExecutor) {
      const previous = active.get(object.ref.id);
      if (previous && deps.tasks.has(previous.key)) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
      const run = { key: `agent:${object.ref.id}:${++execution}`, entered: false };
      const compress = (signal: AbortSignal) => {
        const selection = selectionOf(object).selection;
        const { system } = deps.prepareRequest(deps.selection.agent(selection))();
        const tokens = Math.ceil(system.blocks.reduce((size, block) => size + block.text.length, 0) / 4);
        return compressContext(object, deps.selection.target(selection), tokens, deps.models, signal,
          value => deps.feedback.report(object, value), deps.userAgent, () => deps.feedback.beginCompression(object));
      };
      const publish = (status: ResourceStatus["status"]) => object.events.publish(ResourceStatusChanged, {
        title: object.snapshot()!.title, status,
      });
      const feedback = (error: unknown, signal: AbortSignal) => {
        if (signal.aborted) {
          deps.feedback.report(object, { origin: "model", level: "warning", code: "cancelled", message: "Execution was cancelled." }, true);
          return;
        }
        const details = describeError(error);
        deps.feedback.report(object, { origin: feedbackOrigin(error), level: "error",
          code: error instanceof PluginApiError ? error.code : "execution_failed",
          message: error instanceof Error ? error.message : details.message, details }, true);
      };
      active.set(object.ref.id, run);
      let started: boolean;
      try { started = deps.tasks.start(run.key, async signal => {
        run.entered = true;
        let status: ResourceStatus["status"] = "failed";
        try {
          publish("running");
          const outcome = await runAgentLoop({
            consume: boundary => deliverDrafts(object, boundary),
            completed: async current => { await compress(current); },
            async request(index, current) {
              // Preparation failures end execution before consuming another input.
              const compressed = await compress(current);
              const selection = selectionOf(object).selection, agent = deps.selection.agent(selection);
              const snapshot = object.session.snapshot();
              const observer: ModelRunObserver = {
                event(event) {
                  if (event.type === "progress") return;
                  if (event.type === "diagnostic") {
                    deps.feedback.report(object, { origin: event.origin, code: event.code, message: event.message, level: event.level,
                      ...(event.details ? { details: event.details } : {}) }, event.level === "error" || event.code === "cancelled");
                    return;
                  }
                  object.commit(writer => { writer.append(Execution, event); });
                },
              };
              let result: ModelRunResult;
              try {
                const prepare = deps.prepareRequest(agent);
                let prepared: ReturnType<typeof prepare>;
                result = await deps.execution.withProgress(object.ref, progress => deps.execution.run({ access: object.ref, interactive: true, requestParentId: snapshot.position.nodeId,
                  userAgent: deps.userAgent, completionExtensions: context => agentRequestExtensions(prepared.blocks, context),
                  target: deps.selection.target(selection), system: files => { prepared = prepare(files); return prepared.system; }, messages: projectForAgent(snapshot, object.ref.id), signal: current,
                  cache: { expectHit: index > 0 && !compressed },
                  observer: { event(event) { progress.event(event); return observer.event(event); } },
                }));
              } catch (error) {
                feedback(error, current);
                return { reason: current.aborted ? "cancelled" : "failed", hasTools: false };
              }
              if (result.response) deps.usage?.consume(result.response);
              if (result.reason === "failed" && result.code === "event_delivery") {
                deps.feedback.report(object, { origin: "software", level: "error", code: "event_delivery",
                  message: "The model response could not be saved to the timeline. Execution stopped.",
                  ...(result.details ? { details: result.details } : {}) }, true);
                return { reason: "failed", hasTools: false, halt: true };
              }
              return { reason: result.reason, hasTools: result.tools.length > 0 };
            },
          }, signal);
          status = outcome === "completed" || outcome === "failed" ? outcome : "awaiting";
        } catch (error) {
          status = signal.aborted ? "awaiting" : "failed";
          feedback(error, signal);
        } finally {
          // New input from this point starts a new loop instead of entering the old loop that has stopped consuming.
          finish(object.ref.id);
          object.invalidate();
          publish(status);
        }
      }, { object: object.ref }); }
      catch (error) { finish(object.ref.id); throw error; }
      if (!started) {
        finish(object.ref.id);
        throw new PluginApiError("unavailable", "The agent execution could not be started.");
      }
      object.invalidate();
    },
  };
}
