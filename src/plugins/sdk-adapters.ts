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
  const ref = host.refOf?.(resource.id);
  if (!ref || ref.kind !== resource.kind) throw new PluginApiError("unavailable", "The resource reference is not valid.");
  return ref;
}
function snapshot(host: PluginHostServices, resource: FoldedObject): ResourceSnapshot {
  return resourceSnapshot(address(host, resource), resource);
}
export function adaptResource(contribution: ResourceContribution, sdk: SdkContext, host: PluginHostServices): ResourceBackend {
  const { resource, creation, actions } = contribution;
  const running = new Map<string, { sessionId: string; controller: AbortController; done: Promise<void> }>();
  let closed = false;
  return {
    kind: resource.kind,
    project: object => contribution.project(snapshot(host, object), sdk.object(address(host, object))),
    inspect: object => contribution.inspect(snapshot(host, object), sdk.object(address(host, object))),
    context: object => contribution.context?.(snapshot(host, object), sdk.object(address(host, object))) ?? Promise.resolve([]),
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
          const scope = { active: true };
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
          const result = await actions.prepare?.(parsed, sdk.object(ref), signal);
          if (result?.action === "reject") throw new PluginApiError("rejected", result.message, result.code);
          return jsonSchema.parse(actions.schema.parse(result?.action === "replace" ? result.input : parsed));
        },
        async execute(context, raw, before) {
          if (closed) throw new PluginApiError("unavailable", "The resource controller is closed.");
          if (running.has(context.resource.id)) throw new PluginApiError("unavailable", "An action is already running on this resource.");
          before?.();
          const ref = address(host, context.resource);
          const controller = new AbortController();
          const done = Promise.resolve().then(() => actions.execute(actions.schema.parse(raw), sdk.object(ref), controller.signal))
            .finally(() => { running.delete(ref.id); host.sessions.progressChanged(ref.sessionId); });
          running.set(ref.id, { sessionId: ref.sessionId, controller, done });
          host.sessions.progressChanged(ref.sessionId);
          await done;
        },
      } : {}),
      activity: sessionId => ({ running: [...running].filter(([, run]) => run.sessionId === sessionId).map(([id]) => id), live: [] }),
      async close() {
        closed = true;
        for (const run of running.values()) run.controller.abort();
        await Promise.allSettled([...running.values()].map(run => run.done));
      },
    },
  };
}
export function adaptTool(contribution: ToolContribution, sdk: SdkContext, host: PluginHostServices): ToolImplementation {
  const { contract } = contribution;
  return {
    reference: reference(contract), resourceKind: contract.resource.kind, tool: contract.tool,
    effect: contract.effect, targetSchema: contract.targetSchema, resultSchema: contract.schema,
    prepare: (resource, target, args) => contribution.prepare(snapshot(host, resource), sdk.object(address(host, resource)), target, args),
  };
}
