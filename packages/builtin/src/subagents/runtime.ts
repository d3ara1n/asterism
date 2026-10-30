import { join } from "node:path";
import {
  defineModule, implementResource, implementCreation, implementTool, implementCall, implementChannel, PluginApiError,
  type CallResult, type ApplicationIdentity, type ProviderUsage, type ResourceRef,
} from "@asterism-app/sdk/runtime";
import type { Json } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { builtinConfiguration } from "../configuration/runtime.ts";
import { createRequestAssembly } from "../agent/preparation.ts";
import type { SkillCatalog } from "../skills/catalog.ts";
import { subagentPoolCard } from "../shared/card-appearance.ts";
import { subagentMessages } from "../messages/subagents.ts";
import {
  SubagentPool, CreateSubagentPool, PoolView, Delegation, Delegate, Wait, Check, Steer, Cancel,
  CancelSubagent, SteerSubagent, PoolChannel, subagentParallelism, type TaskOutput,
} from "./contract.ts";
import { SubagentPoolRuntime } from "./service.ts";
import { executeSubagent } from "./execution.ts";
import { AuditLog } from "./audit.ts";
import { currentActivity } from "./activity.ts";

/** Measurements the delegating model can act on; detailed token fields remain in the saved record. */
function modelUsage(usage: TaskOutput["usage"]) {
  return { model: usage.model, requests: usage.requests, elapsedSeconds: Math.round(usage.elapsedMs / 1000), total: usage.total };
}

async function operation<T extends Json>(signal: AbortSignal, work: () => T | Promise<T>): Promise<CallResult<T>> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The pool operation was cancelled." };
    return { kind: error instanceof PluginApiError ? "rejected" : "failed",
      error: { code: error instanceof PluginApiError ? error.reason ?? error.code : "pool_operation_failed",
        message: error instanceof Error ? error.message : String(error) } };
  }
}

export function createSubagentPoolModule(application: ApplicationIdentity, usage: ProviderUsage, skills: SkillCatalog) {
  return defineModule(plugin => {
    const pools = new Map<string, SubagentPoolRuntime>();
    const prepare = createRequestAssembly(plugin, skills);
    const auditDirectory = join(plugin.dir, "subagent-audits");
    const pool = (ref: ResourceRef) => {
      if (ref.kind !== SubagentPool.kind) throw new PluginApiError("invalid_argument", "The target is not a Subagent Pool.");
      const runtime = pools.get(ref.id);
      if (!runtime) throw new PluginApiError("unavailable", "The subagent pool is unavailable.");
      return runtime;
    };
    return {
      resources: [implementResource(SubagentPool, PoolView, {
        card: subagentPoolCard, links: { receive: true }, records: [Delegation], template: { current: [] },
        creation: implementCreation(CreateSubagentPool, { create: input => ({ title: input.title ?? "Subagent Pool", data: {} }) }),
        attach(_data, reader, lifetime) {
          const object = plugin.object(reader.ref.sessionId, SubagentPool, reader.ref.id);
          let timer: ReturnType<typeof setTimeout> | undefined;
          const runtime = new SubagentPoolRuntime({
            object, session: plugin.session(reader.ref.sessionId),
            execute: (run, signal) => executeSubagent(run, signal, {
              access: object.ref, configuration: () => builtinConfiguration(plugin), prepare,
              execution: plugin.execution, content: plugin.content, usage, userAgent: application.userAgent,
              changed: () => runtime.changed(),
            }),
            audit: runId => new AuditLog(auditDirectory, runId),
            changed() {
              if (!object.snapshot()) return;
              timer ??= setTimeout(() => { timer = undefined; if (object.snapshot()) object.invalidate(); }, 40);
            },
            failed: error => plugin.log.error("Subagent result could not be finalized.", error),
          });
          pools.set(object.ref.id, runtime);
          runtime.restore();
          if (!plugin.tasks.start(`subagent-pool:${object.ref.id}`, signal => runtime.supervise(signal), { object: object.ref, affectsHistory: false }))
            throw new PluginApiError("unavailable", "The subagent pool could not start.");
          lifetime.defer(async () => {
            await runtime.close();
            clearTimeout(timer);
            pools.delete(object.ref.id);
          });
        },
        project: (_data, object) => ({ tasks: pool(object.ref).list() }),
        inspect: async (_data, object) => ({
          tasks: pool(object.ref).list(),
          roles: builtinConfiguration(plugin).agents.filter(role => role.enabled).map(({ id, description, examples }) => ({ id, description, examples })),
          parallelism: subagentParallelism,
        }),
        disposalWarning: (_data, object) => pool(object.ref).working ? subagentMessages.runningWarning : null,
      })],
      observers: [{ id: builtin.name("subagent-pool.cursor"), cursorChanged({ snapshot }) {
        for (const resource of snapshot.resources.all()) if (resource.ref.kind === SubagentPool.kind) pools.get(resource.ref.id)?.changed();
      } }],
      tools: [
        implementTool(Delegate, { call(_data, _target, args, { object, caller, signal }) {
          return operation(signal, () => {
            if (!builtinConfiguration(plugin).agents.some(role => role.id === args.role && role.enabled))
              throw new PluginApiError("not_found", `Agent role ${args.role} is unavailable.`);
            return pool(object.ref).delegate(args, caller);
          });
        }, toModel: task => JSON.stringify({ id: task.input.id, role: task.input.role, status: task.status }) }),
        implementTool(Check, { call(_data, target, _args, { object, signal }) {
          return operation(signal, () => pool(object.ref).check(target));
        }, toModel: task => {
          const current = currentActivity(task);
          return JSON.stringify({
            id: task.input.id, role: task.input.role, status: task.status, usage: modelUsage(task.output.usage),
            ...(current ? { current } : {}),
            ...(task.status.phase === "finished" ? { result: task.output.result } : {}),
            ...(task.output.undelivered.length ? { undelivered: task.output.undelivered } : {}),
          });
        } }),
        implementTool(Wait, { call(_data, targets, _args, { object, signal, publish }) {
          return operation(signal, async () => ({ tasks: await pool(object.ref).wait(targets, signal, tasks => publish({ tasks })) }));
        }, toModel: ({ tasks }) => JSON.stringify({ tasks: tasks.map(task => ({
          id: task.id, role: task.role,
          status: task.status.phase === "running" ? { phase: task.status.phase } : task.status,
        })) }) }),
        implementTool(Steer, { call(_data, target, args, { object, signal }) {
          return operation(signal, () => { pool(object.ref).steer(target, args.message); return { id: target, accepted: true as const }; });
        } }),
        implementTool(Cancel, { call(_data, target, args, { object, signal }) {
          return operation(signal, () => pool(object.ref).cancel(target, args.reason));
        } }),
      ],
      calls: [
        implementCall(CancelSubagent, async ({ id }, { object }) => { await pool(object.ref).cancel(id); return null; }),
        implementCall(SteerSubagent, async ({ id, message }, { object }) => { pool(object.ref).steer(id, message); return null; }),
      ],
      channels: [implementChannel(PoolChannel, channel => {
        const runtime = pool(channel.object.ref);
        let selected: string | null = null, sent = 0, reset = true, timer: ReturnType<typeof setTimeout> | undefined;
        const send = () => {
          if (channel.signal.aborted || selected === null) return;
          try {
            const frame = runtime.process(selected, sent);
            channel.send({ ...frame, reset });
            sent += frame.blocks.length; reset = false;
          } catch (error) {
            sent = 0; reset = true;
            channel.send({ task: null, blocks: [], live: [], reset: true, error: error instanceof Error ? error.message : String(error) });
          }
        };
        const unsubscribe = runtime.subscribe(finished => {
          if (finished) { clearTimeout(timer); timer = undefined; send(); }
          else timer ??= setTimeout(() => { timer = undefined; send(); }, 40);
        });
        channel.onMessage(message => { selected = message.id; sent = 0; reset = true; send(); });
        channel.signal.addEventListener("abort", () => { unsubscribe(); clearTimeout(timer); }, { once: true });
      })],
    };
  });
}
