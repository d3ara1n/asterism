import {
  formatModelExpression, modelBlockSchema, parseModelExpression, type ModelBlock, type ModelItem, type ModelLiveBlock,
  type ModelRunEvent, type ModelTarget, type ResourceRef, type Usage,
} from "@asterism-app/sdk/contracts";
import { PluginApiError, type ContentServices, type ExecutionServices, type ProviderUsage } from "@asterism-app/sdk/runtime";
import type { AgentConfiguration, ModelRole } from "@asterism-app/builtin-api/contracts";
import { resolveRoleTarget } from "../configuration/runtime.ts";
import type { createRequestAssembly } from "../agent/preparation.ts";
import { runAgentLoop, type AgentLoopStatus } from "../agent/loop.ts";
import { responseMessages } from "../agent/response-messages.ts";
import { ended, type DelegationInput, type FinishedStatus, type TaskCompletion, type TaskSnapshot, type ProcessBlock } from "./contract.ts";
import type { AuditLog } from "./audit.ts";
import { activityOf, type DeliveredSteer } from "./activity.ts";

export interface ActiveRun {
  snapshot: TaskSnapshot;
  queue: string[];
  /** Delivered steering with its position among finalized blocks, for the activity log. */
  steers: DeliveredSteer[];
  accepting: boolean;
  startedAt: number | null;
  blocks: ProcessBlock[];
  live: ModelLiveBlock[];
  audit: AuditLog;
}
export interface ExecutionDependencies {
  access: ResourceRef;
  configuration(): { agents: readonly AgentConfiguration[]; roles: readonly ModelRole[] };
  prepare: ReturnType<typeof createRequestAssembly>;
  execution: ExecutionServices;
  content: ContentServices;
  usage: Pick<ProviderUsage, "consume">;
  userAgent: string;
  changed(): void;
}

/** An explicit model selection replaces the role's model and thinking level; otherwise the role's ModelRole resolves, then the default ModelRole's model. */
export function resolveTask(configuration: ReturnType<ExecutionDependencies["configuration"]>, input: Pick<DelegationInput, "role" | "model">): {
  agent: AgentConfiguration; target: ModelTarget;
} {
  const agent = configuration.agents.find(agent => agent.id === input.role && agent.enabled);
  if (!agent) throw new PluginApiError("unavailable", `Agent role ${input.role} is unavailable.`);
  if (input.model) {
    const target = parseModelExpression(input.model.model)!;
    return { agent, target: { ...target, ...(input.model.thinking === null ? {} : { thinking: input.model.thinking }) } };
  }
  const roleId = agent.modelRole ?? "default", role = configuration.roles.find(role => role.id === roleId && role.enabled);
  if (!role) throw new PluginApiError("unavailable", `Model role ${roleId} is unavailable.`);
  let model = role.model;
  if (!model && roleId !== "default") {
    const standard = configuration.roles.find(role => role.id === "default" && role.enabled);
    if (!standard) throw new PluginApiError("unavailable", "The default model role is unavailable.");
    model = standard.model;
  }
  return { agent, target: resolveRoleTarget(configuration.roles, roleId, { model }) };
}

const tokenFields = ["input", "output", "total", "reasoning", "cacheRead", "cacheWrite"] as const;
export function accumulateUsage(previous: Usage, next: Usage | null, first: boolean): Usage {
  const usage = { ...previous };
  for (const field of tokenFields) {
    const value = next?.[field] ?? null;
    usage[field] = first ? value : previous[field] === null || value === null ? null : previous[field] + value;
  }
  return usage;
}

/** How a run's execution ended: the loop result or a thrown error, and an interruption observed on its signals. */
export type RunEnding =
  | { kind: "loop"; status: AgentLoopStatus; failure: { code: string; message: string } | null }
  | { kind: "error"; error: unknown };
export type RunInterruption = { kind: "time" } | { kind: "cancelled"; reason: unknown } | null;

/** Single outcome decision: an interruption outranks an error, which outranks the loop result. */
export function classify(ending: RunEnding, interruption: RunInterruption): FinishedStatus {
  if (interruption?.kind === "time") return ended("partial", "budget_exceeded", "The task reached its time budget.");
  if (interruption?.kind === "cancelled")
    return ended("cancelled", "cancelled", interruption.reason instanceof Error ? interruption.reason.message : "The task was cancelled.");
  if (ending.kind === "error") {
    const { error } = ending;
    return ended("failed", error instanceof PluginApiError ? error.reason ?? error.code : "execution_failed",
      error instanceof Error ? error.message : String(error));
  }
  switch (ending.status) {
    case "completed": return ended("succeeded");
    case "limited": return ended("partial", "budget_exceeded", "The task reached its request budget.");
    case "cancelled": return ended("cancelled", "cancelled", "The task was cancelled.");
    case "failed": return ended("failed", ending.failure?.code ?? "execution_failed", ending.failure?.message ?? "The task failed.");
  }
}

/** The runtime owns this conversation; the pool and its records receive only projections and its final report. */
export async function executeSubagent(run: ActiveRun, signal: AbortSignal, deps: ExecutionDependencies): Promise<TaskCompletion> {
  const snapshot = run.snapshot, started = performance.now();
  run.startedAt = started;
  const budget = new AbortController();
  let exhausted = false;
  const current = AbortSignal.any([signal, budget.signal]);
  return deps.content.withScope(async content => {
    run.audit.start(content);
    const messages: ModelItem[] = [
      ...(snapshot.input.context ? [{ kind: "context" as const, parts: [{ kind: "text" as const, text: snapshot.input.context }] }] : []),
      { kind: "input", parts: [{ kind: "text", text: snapshot.input.task }] },
    ];
    run.audit.append({ type: "input", messages });
    const consume = () => {
      const inputs = run.queue.splice(0);
      for (const text of inputs) messages.push({ kind: "input", parts: [{ kind: "text", text }] });
      for (const text of inputs) run.steers.push({ at: run.blocks.length, text });
      if (inputs.length) run.audit.append({ type: "steering-delivered", messages: inputs });
      return inputs.length > 0;
    };
    let ending: RunEnding;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      current.throwIfAborted();
      const { agent, target } = resolveTask(deps.configuration(), snapshot.input);
      snapshot.output.usage.model = formatModelExpression(target);
      snapshot.status = { phase: "running", activity: "starting" };
      timer = setTimeout(() => { if (!current.aborted) { exhausted = true; budget.abort(); } }, agent.budget.maxDurationSeconds * 1000);
      consume(); deps.changed();
      let parent: string | null = null;
      let failure: { code: string; message: string } | null = null;
      const status = await runAgentLoop({
        requestLimit: () => agent.budget.maxRequests,
        completed: async () => { run.accepting = false; },
        consume: boundary => boundary === "request" && consume(),
        async request(index) {
          const blocks: ModelBlock[] = [];
          const prepare = deps.prepare({ ...agent, systemPrompt: `${agent.systemPrompt}\n\nThis is an independent task conversation. The final text response is the report returned to consumers of the Subagent Pool.` });
          snapshot.output.usage.requests++;
          const event = (event: ModelRunEvent): undefined => {
            if (event.type === "progress") {
              run.live = [...event.blocks];
              const last = event.blocks.at(-1);
              if (snapshot.status.phase === "running" && last) {
                const args = last.kind === "toolcall" ? last.arguments : null;
                const tool = args && typeof args === "object" && !Array.isArray(args) && typeof args.tool === "string" ? args.tool : null;
                snapshot.status.activity = last.kind === "toolcall" ? `tool:${tool ?? last.name}` : last.kind;
              }
            } else {
              run.audit.append({ type: "execution", event });
              if (event.type === "block") { blocks.push(event.block); run.blocks.push(modelBlockSchema.parse(event.block)); }
              if (event.type === "diagnostic" && event.level === "error") failure = { code: event.code, message: event.message };
            }
            snapshot.output.usage.elapsedMs = Math.round(performance.now() - started);
            deps.changed();
          };
          const response = await deps.execution.run({
            access: deps.access, interactive: false, target, signal: current, requestParentId: parent,
            userAgent: deps.userAgent, messages, observer: { event },
            tools: { exclude: ["resource_create", "creation_list", "creation_inspect"] },
            system: files => {
              const system = prepare(files).system;
              run.audit.append({ type: "request", index, target, system });
              return system;
            },
          }, { content, output: content });
          parent = response.responseId;
          messages.push(...responseMessages(blocks));
          const last = [...blocks].sort((a, b) => a.ordinal - b.ordinal).findLast(block => block.kind === "text");
          if (last?.kind === "text") snapshot.output.result = last.text;
          Object.assign(snapshot.output.usage, accumulateUsage(snapshot.output.usage, response.completion?.usage ?? null, index === 0));
          if (response.response) deps.usage.consume(response.response);
          if (response.reason === "failed" && !failure)
            failure = { code: response.code, message: response.details?.message ?? "The model request failed." };
          return { reason: response.reason, hasTools: response.tools.length > 0 };
        },
      }, current);
      ending = { kind: "loop", status, failure };
    } catch (error) {
      ending = { kind: "error", error };
    } finally {
      clearTimeout(timer);
      run.accepting = false;
      run.live = [];
      snapshot.output.usage.elapsedMs = Math.round(performance.now() - started);
      if (snapshot.status.phase === "running") snapshot.status.activity = "finalizing";
      deps.changed();
    }
    const interruption: RunInterruption = exhausted ? { kind: "time" } : signal.aborted ? { kind: "cancelled", reason: signal.reason } : null;
    snapshot.output.undelivered = run.queue.splice(0);
    snapshot.output.activity = activityOf(run.blocks, [], run.steers);
    const completion: TaskCompletion = { status: classify(ending, interruption), output: snapshot.output, finishedAt: new Date().toISOString() };
    run.audit.append({ type: "finished", completion });
    try { await run.audit.close(); }
    catch (error) { completion.status = ended("failed", "audit_failed", error instanceof Error ? error.message : String(error)); }
    return completion;
  });
}
