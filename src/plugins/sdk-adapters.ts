import { jsonSchema, reference, type ResourceCall, type Json, type ContractReference } from "@atelier/sdk/contracts";
import { PluginApiError, type Lifetime, type ResourceContribution, type ResourceRef, type ToolContribution, type ResourceSnapshot } from "@atelier/sdk/runtime";
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
import type { ObjectScope } from "./host.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import { contentReferences } from "../runtime/content-store.ts";
import { AsyncLocalStorage } from "node:async_hooks";

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
  // 活跃动作链按宿主资源实现隔离；已完成动作的异步后代可以再次调用该对象。
  const executing = new AsyncLocalStorage<readonly { id: string; active: boolean }[]>();
  const assertActionEntry = (id: string) => {
    if (executing.getStore()?.some(entry => entry.active && entry.id === id))
      throw new PluginApiError("conflict", "An action cannot invoke another action on the same object before it finishes.");
  };
  return {
    kind: resource.kind,
    validateState(data) {
      if (!resource.stateSchema.safeParse(data).success)
        throw new SessionError("invalid_request", "Saved resource state does not match its schema.");
    },
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
    disposalWarning: object => {
      const captured = snapshot(host, object);
      return contribution.disposalWarning?.(captured, sdk.reader(captured.ref, undefined, captured)) ?? null;
    },
    ...(contribution.attach ? { attach: (captured: ResourceSnapshot, lifetime: Lifetime) =>
      synchronous(() => contribution.attach!(captured, sdk.reader(captured.ref, undefined, captured), lifetime)) } : {}),
    controller: {
      creationId: creation?.contract.id,
      creationContract: creation?.contract,
      actionContracts: [...actions.values()].map(action => action.contract),
      assertActionEntry,
      ...(creation ? {
        async prepareCreate(input: ResourceCall, request?: AbortSignal, content?: ContentLease) {
          try {
            const parsed = parseCall(creation.contract, input).value;
            return await runs.start(async signal => {
              signal.throwIfAborted();
              const prepared = applyPreparation(creation.contract, parsed, await creation.prepare?.(parsed, { signal, content: sdk.content(content, undefined, signal) }));
              host.content?.validate(prepared, { scope: content });
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
        create(sessionId: string, id: string, input: Json, content?: ContentLease) {
          if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const scope = { active: true, provisional: true, content };
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
        parseCommand(call: ResourceCall) {
          return parseCall(actionFor(call).contract, call);
        },
        async prepareCommand(call: ParsedCall, ref: ResourceRef, signal: AbortSignal) {
          const action = actionFor(call);
          const scope = { active: true, provisional: !host.refOf(ref.id), content: call.content };
          let result;
          try { result = await runs.start(async preparationSignal => {
            preparationSignal.throwIfAborted();
            const result = await action.prepare?.(call.value, { signal: preparationSignal, object: sdk.reader(ref, scope), content: sdk.content(call.content, ref, preparationSignal) });
            preparationSignal.throwIfAborted();
            return result;
          }, { object: ref, signal, affectsHistory: false }).done; }
          finally { scope.active = false; }
          const value = applyPreparation(action.contract, call.value, result);
          if (contentReferences(value).length) host.content?.validate(value, { scope: call.content, sessionId: ref.sessionId, objectId: ref.id,
            recordIds: new Set(host.refOf(ref.id) ? host.sessions.view(ref.sessionId).timelineIds() : []) });
          return { ...call, value };
        },
        async execute(context, raw, before) {
          if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const ref = { sessionId: context.sessionId, id: context.resource.id, kind: resource.kind };
          assertActionEntry(ref.id);
          const previous = queued.get(ref.id)?.done ?? Promise.resolve();
          const work = runs.start(async signal => {
            await previous.catch(() => {});
            signal.throwIfAborted();
            if (runs.closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
            const scope = { active: true, provisional: !host.refOf(ref.id), before, content: raw.content };
            sdk.linkAbort(raw.content, signal);
            if (host.refOf(ref.id)) before?.();
            const entry = { id: ref.id, active: true };
            try {
              await executing.run([...(executing.getStore() ?? []), entry],
                () => actionFor(raw).execute(raw.value, sdk.object(ref, scope), signal));
            } finally { entry.active = false; scope.active = false; }
          }, { object: ref, signal: context.signal });
          const done = work.done.catch(error => {
              if (error instanceof PluginApiError) throw new SessionError(
                error.reason ?? (error.code === "invalid_argument" || error.code === "rejected" ? "invalid_request"
                  : error.code === "conflict" || error.code === "not_found" ? error.code : "unavailable"),
                error.message, error.display ?? (error.reason ? error.message : undefined));
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
      activity: sessionId => ({ busy: runs.activity(sessionId), live: [] }),
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
    prepare(resource, target, args, caller) {
      const captured = snapshot(host, resource);
      const scope: ObjectScope = { active: false, execution: true };
      const prepared = contribution.prepare(captured, sdk.object(captured.ref, scope, captured), target, args,
        Object.freeze({ ref: Object.freeze({ ...caller.ref }), title: caller.title }));
      if (!("execute" in prepared)) return prepared;
      return { ...prepared, async execute(signal, publish, handover?: ContentLease) {
        scope.active = true;
        scope.content = host.content?.scope();
        sdk.linkAbort(scope.content, signal);
        try { return await prepared.execute(signal, publish); }
        finally {
          scope.active = false;
          // 暂存内容交接给请求占用，直到结果记录在同一事务登记内容根；未提交时随请求一起回收。
          if (handover && scope.content && !handover.closed) for (const id of scope.content.refs) handover.add(id);
          await scope.content?.close();
        }
      } };
    },
  };
}
