import {
  formatModelExpression, modelBlockSchema, type ModelBlock, type ModelItem, type ModelLiveBlock,
  type ModelRunEvent, type ModelTarget, type ResourceRef, type Usage,
} from "@asterism-app/sdk/contracts";
import { PluginApiError, type ContentServices, type ExecutionServices, type ProviderUsage } from "@asterism-app/sdk/runtime";
import type { AgentConfiguration, ModelRole } from "@asterism-app/builtin-api/contracts";
import { resolveRoleTarget } from "../configuration/runtime.ts";
import type { createRequestAssembly } from "../agent/preparation.ts";
import { runAgentLoop } from "../agent/loop.ts";
import { responseMessages } from "../agent/response-messages.ts";
import { ended, type DelegateInput, type TaskCompletion, type TaskSnapshot, type ProcessBlock } from "./contract.ts";
import { saveAudit, type AuditEntry } from "./audit.ts";

export interface ActiveRun {
  snapshot: TaskSnapshot;
  queue: string[];
  accepting: boolean;
  startedAt: number | null;
  blocks: ProcessBlock[];
  live: ModelLiveBlock[];
  audit: AuditEntry[];
}
export interface ExecutionDependencies {
  access: ResourceRef;
  configuration(): { agents: readonly AgentConfiguration[]; roles: readonly ModelRole[] };
  prepare: ReturnType<typeof createRequestAssembly>;
  execution: ExecutionServices;
  content: ContentServices;
  usage: Pick<ProviderUsage, "consume">;
  userAgent: string;
  auditDirectory: string;
  changed(): void;
}
export function resolveTask(configuration: ReturnType<ExecutionDependencies["configuration"]>, input: Pick<DelegateInput, "role" | "model">): {
  agent: AgentConfiguration; target: ModelTarget;
} {
  const agent = configuration.agents.find(agent => agent.id === input.role && agent.enabled);
  if (!agent) throw new PluginApiError("unavailable", `Agent role ${input.role} is unavailable.`);
  const roleId = agent.modelRole ?? "default", role = configuration.roles.find(role => role.id === roleId && role.enabled);
  if (!role) throw new PluginApiError("unavailable", `Model role ${roleId} is unavailable.`);
  let model = input.model ?? role.model;
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

/** The runtime owns this conversation; the pool and its records receive only projections and its final report. */
export async function executeSubagent(run: ActiveRun, signal: AbortSignal, deps: ExecutionDependencies): Promise<TaskCompletion> {
  const snapshot = run.snapshot, started = performance.now();
  run.startedAt = started;
  const budget = new AbortController();
  const current = AbortSignal.any([signal, budget.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return deps.content.withScope(async content => {
    const messages: ModelItem[] = [
      ...(snapshot.input.context ? [{ kind: "context" as const, parts: [{ kind: "text" as const, text: snapshot.input.context }] }] : []),
      { kind: "input", parts: [{ kind: "text", text: snapshot.input.task }] },
    ];
    let status = ended("failed", "execution_failed", "The task did not complete.");
    run.audit.push({ type: "input", messages: [...messages] });
    const consume = () => {
      const inputs = run.queue.splice(0);
      for (const text of inputs) messages.push({ kind: "input", parts: [{ kind: "text", text }] });
      if (inputs.length) run.audit.push({ type: "steering-delivered", messages: inputs });
      return inputs.length > 0;
    };
    try {
      current.throwIfAborted();
      const { agent, target } = resolveTask(deps.configuration(), { role: snapshot.input.role, model: snapshot.input.model ?? undefined });
      snapshot.output.usage.model = formatModelExpression(target);
      snapshot.status = { phase: "running", activity: "starting" };
      timer = setTimeout(() => budget.abort(), agent.maxDurationSeconds * 1000);
      consume(); deps.changed();
      let parent: string | null = null;
      const failure: { current: { code: string; message: string } | null } = { current: null };
      const result = await runAgentLoop({
        requestLimit: () => agent.maxTurns ?? Infinity,
        limitReached() {},
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
              run.audit.push({ type: "execution", event });
              if (event.type === "block") { blocks.push(event.block); run.blocks.push(modelBlockSchema.parse(event.block)); }
              if (event.type === "diagnostic" && event.level === "error") failure.current = { code: event.code, message: event.message };
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
              run.audit.push({ type: "request", index, target, system });
              return system;
            },
          }, { content, output: content });
          parent = response.responseId;
          messages.push(...responseMessages(blocks));
          const last = [...blocks].sort((a, b) => a.ordinal - b.ordinal).findLast(block => block.kind === "text");
          if (last?.kind === "text") snapshot.output.result = last.text;
          Object.assign(snapshot.output.usage, accumulateUsage(snapshot.output.usage, response.completion?.usage ?? null, index === 0));
          if (response.response) deps.usage.consume(response.response);
          if (response.reason === "failed" && !failure.current)
            failure.current = { code: response.code, message: response.details?.message ?? "The model request failed." };
          return { reason: response.reason, hasTools: response.tools.length > 0 };
        },
      }, current);
      switch (result) {
        case "completed":
          if (run.queue.length > 0)
            status = ended("partial", "request_budget", "The task reached its request budget with additional input still queued.");
          else if (snapshot.output.result === null)
            status = ended("failed", "empty_report", "The task ended without a text report.");
          else status = ended("succeeded");
          break;
        case "limited":
          status = ended("partial", "request_budget", "The task reached its request budget.");
          break;
        case "cancelled":
          status = ended("cancelled", "cancelled", "The task was cancelled.");
          break;
        case "failed":
          status = ended("failed", failure.current?.code ?? "execution_failed", failure.current?.message ?? "The task failed.");
          break;
      }
    } catch (error) {
      status = current.aborted ? ended("cancelled", "cancelled", signal.reason instanceof Error ? signal.reason.message : "The task was cancelled.")
        : ended("failed", error instanceof PluginApiError ? error.reason ?? error.code : "execution_failed",
          error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
      run.accepting = false;
      run.live = [];
      snapshot.output.usage.elapsedMs = Math.round(performance.now() - started);
      if (snapshot.status.phase === "running") snapshot.status.activity = "finalizing";
      deps.changed();
    }
    if (current.aborted) status = budget.signal.aborted && current.reason === budget.signal.reason
      ? ended("partial", "time_budget", "The task reached its time budget.")
      : ended("cancelled", "cancelled", current.reason instanceof Error ? current.reason.message : "The task was cancelled.");
    const completion: TaskCompletion = { status, output: snapshot.output, finishedAt: new Date().toISOString() };
    run.audit.push({ type: "finished", completion });
    try { await saveAudit(deps.auditDirectory, snapshot.input.runId, run.audit, content); }
    catch (error) {
      completion.status = ended("failed", "audit_failed", error instanceof Error ? error.message : String(error));
    }
    return completion;
  });
}
