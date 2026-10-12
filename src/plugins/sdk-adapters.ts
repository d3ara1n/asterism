import { jsonSchema, reference, resourceCallSchema, type Json, type ContractReference } from "@atelier/sdk/contracts";
import { PluginApiError, type ResourceContribution, type ResourceRef, type ToolContribution, type ResourceSnapshot } from "@atelier/sdk/runtime";
import { SessionError } from "../session/tree.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import type { PluginHostServices } from "./loader.ts";
import { resourceSnapshot } from "./records.ts";
import type { SdkContext } from "./sdk-context.ts";
import type { RunGroup } from "./lifecycle.ts";
import { parseCall, applyPreparation, type ParsedCall } from "./commands.ts";
import { synchronous } from "./synchronous.ts";

function address(host: PluginHostServices, resource: FoldedObject): ResourceRef {
  const ref = host.refOf(resource.id);
  if (!ref || ref.kind !== resource.kind) throw new PluginApiError("unavailable", "The resource reference is not valid.");
  return ref;
}
function snapshot(host: PluginHostServices, resource: FoldedObject): ResourceSnapshot {
  return resourceSnapshot(address(host, resource), resource);
}
export function adaptResource(contribution: ResourceContribution, sdk: SdkContext, host: PluginHostServices, runs: RunGroup): ResourceBackend {
  const { resource, creation } = contribution;
  const actions = new Map((contribution.actions ?? []).map(action => [action.contract.id, action]));
  const actionFor = (call: ContractReference) => {
    const action = actions.get(call.id);
    if (!action)
      throw new PluginApiError("invalid_argument", "The action is not available for this resource.");
    return action;
  };
  const queued = new Map<string, { sessionId: string; done: Promise<void> }>();
  return {
    kind: resource.kind,
    receivesLinks: contribution.links?.receive === true,
    project: object => {
      const captured = snapshot(host, object);
      return contribution.project(captured, sdk.reader(captured.ref, undefined, captured));
    },
    inspect: object => {
      const captured = snapshot(host, object);
      return contribution.inspect(captured, sdk.reader(captured.ref, undefined, captured));
    },
    context: object => {
      const captured = snapshot(host, object);
      return contribution.context?.(captured, sdk.reader(captured.ref, undefined, captured)) ?? Promise.resolve([]);
    },
    controller: {
      ...(creation ? {
        async prepareCreate(input: unknown, request?: AbortSignal) {
          try {
            const parsed = parseCall(creation.contract, resourceCallSchema.parse(input)).value;
            return await runs.start(async signal => {
              signal.throwIfAborted();
              const prepared = applyPreparation(creation.contract, parsed, await creation.prepare?.(parsed, signal));
              signal.throwIfAborted();
              return prepared;
            }, { timeoutMs: 10_000, signal: request }).done;
          } catch (error) {
            if (error instanceof PluginApiError && (error.code === "invalid_argument" || error.code === "rejected")) {
              throw new SessionError("invalid_request", error.message);
            }
            throw error;
          }
        },
        create(sessionId: string, id: string, input: Json) {
          if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const scope = { active: true, provisional: true };
          try {
            let result!: { title: string; data: Json };
            synchronous(() => { result = creation.create(input, sdk.object({ sessionId, id, kind: resource.kind }, scope)); return result; });
            const data = jsonSchema.parse(resource.stateSchema.parse(result.data));
            if (!data || typeof data !== "object" || Array.isArray(data) || ["id", "type", "title"].some(key => key in data))
              throw new PluginApiError("invalid_argument", "Resource creation data must be an object without reserved id, type or title fields.");
            if (typeof result.title !== "string") throw new PluginApiError("invalid_argument", "The resource title must be a string.");
            return { title: result.title, data };
          } finally { scope.active = false; }
        },
      } : {}),
      ...(actions.size ? {
        parseCommand(raw: unknown) {
          const call = resourceCallSchema.parse(raw);
          return parseCall(actionFor(call).contract, call);
        },
        async prepareCommand(call: ParsedCall, ref: ResourceRef, signal: AbortSignal) {
          const action = actionFor(call);
          const scope = { active: true, provisional: !host.refOf(ref.id) };
          let result;
          try { result = await runs.start(async preparationSignal => {
            preparationSignal.throwIfAborted();
            const result = await action.prepare?.(call.value, sdk.reader(ref, scope), preparationSignal);
            preparationSignal.throwIfAborted();
            return result;
          }, { object: ref, signal, affectsHistory: false }).done; }
          finally { scope.active = false; }
          return { ...call, value: applyPreparation(action.contract, call.value, result) };
        },
        async execute(context, raw, before) {
          if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const ref = { sessionId: context.sessionId, id: context.resource.id, kind: resource.kind };
          const previous = queued.get(ref.id)?.done ?? Promise.resolve();
          const work = runs.start(async signal => {
            await previous.catch(() => {});
            signal.throwIfAborted();
            if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
            const scope = { active: true, provisional: !host.refOf(ref.id), before };
            if (host.refOf(ref.id)) before?.();
            try { await actionFor(raw).execute(raw.value, sdk.object(ref, scope), signal); }
            finally { scope.active = false; }
          }, { object: ref });
          const done = work.done.catch(error => {
              if (error instanceof PluginApiError) throw new SessionError(
                error.code === "invalid_argument" || error.code === "rejected" ? "invalid_request"
                  : error.code === "conflict" || error.code === "not_found" ? error.code : "unavailable", error.message);
              throw error;
            })
            .finally(() => {
              if (queued.get(ref.id)?.done === done) queued.delete(ref.id);
              if (host.refOf(ref.id)) host.sessions.progressChanged(ref.sessionId);
            });
          queued.set(ref.id, { sessionId: ref.sessionId, done });
          if (host.refOf(ref.id)) host.sessions.progressChanged(ref.sessionId);
          await done;
        },
      } : {}),
      ...(contribution.links?.receive ? { linkTools(sessionId: string, id: string, linked: FoldedObject) {
        const policy = contribution.links?.tools?.(sdk.reader({ sessionId, id, kind: resource.kind }));
        const allowed = policy?.allow ? new Set(policy.allow) : null, excluded = new Set(policy?.exclude ?? []);
        return host.sessions.capabilities([linked], name => (allowed === null || allowed.has(name)) && !excluded.has(name)).describe(linked.id);
      } } : {}),
      activity: sessionId => ({ running: runs.activity(sessionId), live: [] }),
      async close() {
        await runs.close();
      },
    },
  };
}
export function adaptTool(contribution: ToolContribution, sdk: SdkContext, host: PluginHostServices): ToolImplementation {
  const { contract } = contribution;
  return {
    reference: reference(contract), resourceKind: contract.resource.kind, tool: contract.tool,
    effect: contract.effect, targetSchema: contract.targetSchema, resultSchema: contract.schema,
    prepare(resource, target, args) {
      const captured = snapshot(host, resource);
      const scope = { active: false, execution: true };
      const prepared = contribution.prepare(captured, sdk.object(captured.ref, scope, captured), target, args);
      if (!("execute" in prepared)) return prepared;
      return { ...prepared, async execute(signal, publish) {
        scope.active = true;
        try { return await prepared.execute(signal, publish); }
        finally { scope.active = false; }
      } };
    },
  };
}
