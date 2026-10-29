import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices } from "@asterism-app/sdk/runtime";
import { ResourceStatusChanged, describeError, type ResourceStatus, type ModelRunObserver } from "@asterism-app/sdk/contracts";
import { Execution } from "@asterism-app/builtin-api/contracts";
import { agentRequestExtensions } from "./request-context.ts";
import { feedbackOrigin } from "./feedback.ts";
import type { createAgentFeedback } from "./feedback-state.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { createRequestAssembly } from "./preparation.ts";
import type { SkillCatalog } from "../skills/catalog.ts";
import { projectForAgent } from "./projection.ts";
import { compressContext } from "./compression.ts";
import { deliverDrafts } from "./drafts.ts";
import type { ProviderUsage } from "@asterism-app/sdk/runtime";

interface AgentLoopDependencies {
  selection: AgentSelectionService;
  tasks: PluginTasks;
  models: ModelServices;
  prepareRequest: ReturnType<typeof createRequestAssembly>;
  skills: SkillCatalog;
  userAgent: string;
  usage?: Pick<ProviderUsage, "consume">;
  feedback: ReturnType<typeof createAgentFeedback>;
}

/** The loop owns execution counts; message and turn boundaries are read from the timeline, and pending input belongs to the resource. */
export function createAgentLoop(deps: AgentLoopDependencies) {
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
          // Agent start extension point; lifecycle observation and interception are defined when actual consumers integrate.
          publish("running");
          // Turn start extension point; explicitly resuming execution still belongs to the original turn.
          let request = 0;
          for (;;) {
            signal.throwIfAborted();
            let cancelled = false, completed = false, hasTools = false;
            const requestLimit = deps.selection.agent(selectionOf(object).selection).maxTurns ?? 32;
            if (request >= requestLimit) {
              deps.feedback.report(object, { origin: "model", level: "warning", code: "request_limit",
                message: "The agent reached the model request limit. Continue explicitly to resume." }, true);
              status = "awaiting";
            } else {
              // Summary persistence failure ends execution directly instead of entering the model-error handling branch.
              const compressed = await compress(signal);
              // Request start extension point: capture this request's context, configuration, and authorization after summarization completes.
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
              let result: Awaited<ReturnType<ModelServices["run"]>> | undefined;
              try {
                const prepare = deps.prepareRequest(agent);
                let prepared: ReturnType<typeof prepare>;
                result = await deps.skills.during(object.ref.id, bind => deps.models.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
                  userAgent: deps.userAgent, completionExtensions: context => agentRequestExtensions(prepared.blocks, context),
                  target: deps.selection.target(selection), system: files => { prepared = prepare(files); bind(prepared.skills); return prepared.system; }, messages: projectForAgent(snapshot, object.ref.id), signal,
                  tools: deps.selection.tools(agent), cache: { expectHit: request > 0 && !compressed }, observer,
                }));
              } catch (error) {
                cancelled = signal.aborted;
                status = cancelled ? "awaiting" : "failed";
                feedback(error, signal);
              }
              request++;
              if (result) {
                if (result.response) deps.usage?.consume(result.response);
                if (result.reason === "failed" && result.code === "event_delivery") {
                  status = "failed";
                  deps.feedback.report(object, { origin: "software", level: "error", code: "event_delivery",
                    message: "The model response could not be saved to the timeline. Execution stopped.",
                    ...(result.details ? { details: result.details } : {}) }, true);
                  return;
                }
                // Request end: includes the response's complete tool batch; cancellation preserves all pending input.
                cancelled = signal.aborted || result.reason === "cancelled";
                completed = result.reason === "completed";
                hasTools = result.tools.length > 0;
                status = result.reason === "cancelled" ? "awaiting" : result.reason;
              }
            }
            if (cancelled || signal.aborted) { status = "awaiting"; return; }
            if (completed) {
              if (request < requestLimit && deliverDrafts(object, "request")) continue;
              if (hasTools) continue;
              await compress(signal);
            }
            // Turn end and Agent settled are independent; normal completion, errors, and request limits can all deliver the next batch.
            signal.throwIfAborted();
            if (!deliverDrafts(object, "turn")) return;
            // The next input batch has been delivered atomically; enter a new turn here.
            request = 0;
          }
        } catch (error) {
          status = signal.aborted ? "awaiting" : "failed";
          feedback(error, signal);
        } finally {
          // New input from this point starts a new loop instead of entering the old loop that has stopped consuming.
          finish(object.ref.id);
          object.invalidate();
          publish(status);
          // Agent settled is determined after the host waits for the task and related activities to actually end.
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
