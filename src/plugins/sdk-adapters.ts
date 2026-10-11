import { jsonSchema, reference, type Json } from "@atelier/sdk/contracts";
import { PluginApiError, validationMessage, type ResourceContribution, type ResourceRef, type ToolContribution, type ResourceSnapshot } from "@atelier/sdk/runtime";
import { SessionError } from "../session/tree.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import type { ToolImplementation } from "../tools/contract.ts";
import type { PluginHostServices } from "./loader.ts";
import { resourceSnapshot } from "./records.ts";
import type { SdkContext } from "./sdk-context.ts";
import { synchronous } from "./synchronous.ts";

function address(host: PluginHostServices, resource: FoldedObject): ResourceRef {
  const ref = host.refOf(resource.id);
  if (!ref || ref.kind !== resource.kind) throw new PluginApiError("unavailable", "The resource reference is not valid.");
  return ref;
}
function snapshot(host: PluginHostServices, resource: FoldedObject): ResourceSnapshot {
  return resourceSnapshot(address(host, resource), resource);
}
export function adaptResource(contribution: ResourceContribution, sdk: SdkContext, host: PluginHostServices): ResourceBackend {
  const { resource, creation, actions } = contribution;
  const running = new Map<string, AbortController>();
  const queued = new Map<string, { sessionId: string; done: Promise<void> }>();
  let closed = false;
  return {
    kind: resource.kind,
    receivesLinks: contribution.links?.receive === true,
    project: object => {
      const captured = snapshot(host, object);
      return contribution.project(captured, sdk.object(captured.ref, undefined, captured));
    },
    inspect: object => {
      const captured = snapshot(host, object);
      return contribution.inspect(captured, sdk.object(captured.ref, undefined, captured));
    },
    context: object => {
      const captured = snapshot(host, object);
      return contribution.context?.(captured, sdk.object(captured.ref, undefined, captured)) ?? Promise.resolve([]);
    },
    controller: {
      ...(creation ? {
        async prepareCreate(input: unknown) {
          const parsed = creation.schema.safeParse(input);
          if (!parsed.success) throw new SessionError("invalid_request", validationMessage(parsed.error, "input"));
          try {
            const prepared = creation.prepare ? await creation.prepare(parsed.data, AbortSignal.timeout(10_000)) : parsed.data;
            return jsonSchema.parse(creation.schema.parse(prepared));
          } catch (error) {
            if (error instanceof PluginApiError && (error.code === "invalid_argument" || error.code === "rejected")) {
              throw new SessionError("invalid_request", error.message);
            }
            throw error;
          }
        },
        create(sessionId: string, id: string, input: Json) {
          if (closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const scope = { active: true, provisional: true };
          try {
            let result!: { title: string; data: Json };
            synchronous(() => { result = creation.create(creation.schema.parse(input), sdk.object({ sessionId, id, kind: resource.kind }, scope)); return result; });
            const data = jsonSchema.parse(resource.stateSchema.parse(result.data));
            if (!data || typeof data !== "object" || Array.isArray(data) || ["id", "type", "title"].some(key => key in data))
              throw new PluginApiError("invalid_argument", "Resource creation data must be an object without reserved id, type or title fields.");
            if (typeof result.title !== "string") throw new PluginApiError("invalid_argument", "The resource title must be a string.");
            return { title: result.title, data };
          } finally { scope.active = false; }
        },
      } : {}),
      ...(actions ? {
        validateCommand: (input: Json) => jsonSchema.parse(actions.schema.parse(input)),
        async prepareCommand(input: Json, ref: ResourceRef, signal: AbortSignal) {
          const parsed = actions.schema.parse(input);
          const scope = { active: true, provisional: !host.refOf(ref.id) };
          let result;
          try { result = await actions.prepare?.(parsed, sdk.object(ref, scope), signal); }
          finally { scope.active = false; }
          if (result?.action === "reject") throw new PluginApiError("rejected", result.message, result.code);
          return jsonSchema.parse(actions.schema.parse(result?.action === "replace" ? result.input : parsed));
        },
        async execute(context, raw, before) {
          if (closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          const ref = { sessionId: context.sessionId, id: context.resource.id, kind: resource.kind };
          const previous = queued.get(ref.id)?.done ?? Promise.resolve();
          const done = previous.catch(() => {}).then(async () => {
            if (closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
            const scope = { active: true, provisional: !host.refOf(ref.id), before };
            if (host.refOf(ref.id)) before?.();
            const controller = new AbortController();
            running.set(ref.id, controller);
            try { await actions.execute(actions.schema.parse(raw), sdk.object(ref, scope), controller.signal); }
            finally { scope.active = false; running.delete(ref.id); }
          })
            .catch(error => {
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
        const policy = contribution.links?.tools?.(sdk.object({ sessionId, id, kind: resource.kind }));
        const allowed = policy?.allow ? new Set(policy.allow) : null, excluded = new Set(policy?.exclude ?? []);
        return host.sessions.capabilities([linked], name => (allowed === null || allowed.has(name)) && !excluded.has(name)).describe(linked.id);
      } } : {}),
      activity: sessionId => ({ running: [...queued].filter(([, action]) => action.sessionId === sessionId).map(([id]) => id), live: [] }),
      async close() {
        closed = true;
        for (const controller of running.values()) controller.abort();
        await Promise.allSettled([...queued.values()].map(action => action.done));
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
