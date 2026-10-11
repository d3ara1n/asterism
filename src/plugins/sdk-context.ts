import { belongsTo, jsonSchema, type DataContract, type Json, type RecordContract } from "@atelier/sdk/contracts";
import { PluginApiError, type ObjectContext, type PluginContext, type ResourceRef, type SessionHandle, type ObjectWriter } from "@atelier/sdk/runtime";
import type { PluginContext as InternalContext } from "./contract.ts";
import type { PluginHostServices } from "./loader.ts";
import { foldWorkbench } from "../session/fold.ts";
import { sessionSnapshot } from "./records.ts";
import { synchronous } from "./synchronous.ts";
import type { LiveBlock } from "../shared/session.ts";

export function createSdkContext(internal: InternalContext, host: PluginHostServices) {
  const records = new Map<string, RecordContract>();
  const running = new Map<string, { sessionId: string; controller: AbortController; done: Promise<unknown>; live: LiveBlock[] }>();
  let available = true;
  let closing = false;
  const checkAvailable = () => {
    if (!available) throw new PluginApiError("unavailable", "The plugin is not available.");
  };
  const own = (kind: string) => {
    if (!belongsTo(internal.id, kind)) throw new PluginApiError("foreign_resource", "The resource belongs to another plugin.");
  };
  const checkRef = (ref: ResourceRef, provisional = false) => {
    checkAvailable();
    const actual = host.refOf?.(ref.id);
    if (!actual && provisional) { host.sessions.title(ref.sessionId); return; }
    if (!actual || actual.sessionId !== ref.sessionId || actual.kind !== ref.kind)
      throw new PluginApiError("unavailable", "The resource reference is no longer valid.");
  };
  const checkState = (contract: DataContract) => {
    if (!belongsTo(internal.id, contract.id)) throw new PluginApiError("foreign_resource", "The state contract belongs to another plugin.");
    if (contract.version !== 1) throw new PluginApiError("invalid_argument", "Resource state storage currently supports contract version 1.");
  };
  const session = (id: string): SessionHandle => ({
    id,
    snapshot() {
      checkAvailable();
      return sessionSnapshot(id, host.sessions.title(id), host.sessions.nodes(id), host.sessions.path(id));
    },
    title: {
      get: () => { checkAvailable(); return host.sessions.title(id); },
      propose: (text, options) => { checkAvailable(); return host.sessions.proposeTitle(id, text, options.expected); },
    },
    commit: work => commit(id, work),
  });
  function commit(id: string, work: (writer: ObjectWriter) => unknown, ref?: ResourceRef, provisional = false): void {
    checkAvailable();
    if (ref) {
      own(ref.kind); checkRef(ref, provisional);
      if (!provisional && !foldWorkbench(host.sessions.path(id)).objects.some(object => object.id === ref.id))
        throw new PluginApiError("unavailable", "The resource is not on the current session path.");
    }
    host.sessions.commit(id, writer => {
      let active = true;
      const check = () => {
        if (!active) throw new PluginApiError("unavailable", "The writer is outside its commit callback.");
      };
      try {
        synchronous(() => work({
          append(contract, data) {
            check();
            const declared = records.get(contract.id);
            if (!declared || !belongsTo(internal.id, contract.id))
              throw new PluginApiError("foreign_event", "The plugin did not declare this record contract.");
            if (contract.version !== declared.version || declared.version !== 1)
              throw new PluginApiError("invalid_argument", "Event storage currently supports contract version 1.");
            const parsed = declared.schema.safeParse(data);
            if (!parsed.success) throw new PluginApiError("invalid_argument", "The record does not match its declared schema.");
            return writer.append({ kind: "event", type: declared.id, data: jsonSchema.parse(parsed.data), agentId: ref?.id ?? null, model: null });
          },
          set(contract, data) {
            check();
            if (!ref) throw new PluginApiError("invalid_argument", "Session commits cannot write resource state.");
            checkState(contract);
            const parsed = contract.schema.safeParse(data);
            if (!parsed.success) throw new PluginApiError("invalid_argument", "The state does not match its contract schema.");
            host.state.set(id, ref.id, contract.id, jsonSchema.parse(parsed.data));
          },
        }));
      } finally { active = false; }
    });
  }
  const object = (address: ResourceRef, scope?: { active: boolean }): ObjectContext => {
    const ref = Object.freeze({ ...address });
    checkRef(ref, scope?.active);
    return {
      ref, session: session(ref.sessionId),
      get(contract) {
        own(ref.kind); checkRef(ref, scope?.active); checkState(contract);
        const raw = host.state.get(ref.id, contract.id);
        if (raw === null) return null;
        const parsed = contract.schema.safeParse(raw);
        if (!parsed.success) throw new PluginApiError("unavailable", "The stored state does not match its contract schema.");
        return parsed.data;
      },
      commit: work => commit(ref.sessionId, work, ref, scope?.active),
      streams: { publish(channel, data) {
        own(ref.kind); checkRef(ref, scope?.active);
        if (!(data instanceof Uint8Array)) throw new PluginApiError("invalid_argument", "Stream data must be a Uint8Array.");
        host.stream?.({ sessionId: ref.sessionId, objectId: ref.id, channel: `${internal.id}/${channel}`, data });
      } },
    };
  };
  const context: PluginContext = {
    id: internal.id, dir: internal.dir, log: internal.log,
    config: (schema, defaults) => { checkAvailable(); return internal.config(schema, defaults); },
    secrets: internal.secrets, db: () => { checkAvailable(); return internal.db(); }, tasks: internal.tasks,
    models: {
      stream: request => { checkAvailable(); return host.models.stream(request); },
      run(request) {
        if (closing) throw new PluginApiError("unavailable", "The plugin is closing.");
        const ref = Object.freeze({ ...request.object });
        own(ref.kind); checkRef(ref);
        if (running.has(ref.id)) throw new PluginApiError("unavailable", "A model request is already running on this resource.");
        const path = host.sessions.path(ref.sessionId);
        if (!foldWorkbench(path).objects.some(object => object.id === ref.id))
          throw new PluginApiError("unavailable", "The resource is not on the current session path.");
        if ((path.at(-1)?.id ?? null) !== request.requestParentId)
          throw new PluginApiError("invalid_argument", "Rebuild model input from the current session position.");
        const { target, system, messages, tools, cache } = structuredClone({
          target: request.target, system: request.system, messages: request.messages, tools: request.tools, cache: request.cache,
        });
        const allowed = tools?.allow ? new Set(tools.allow) : null;
        const excluded = new Set(tools?.exclude ?? []);
        const linked = host.sessions.linked(path, ref.id);
        const capabilities = host.sessions.capabilities(linked, name => (allowed === null || allowed.has(name)) && !excluded.has(name));
        const controller = new AbortController();
        const receive = request.observer.event.bind(request.observer);
        const done = host.models.run({ object: ref, target, system, messages, tools, cache, requestParentId: request.requestParentId,
          signal: AbortSignal.any([request.signal, controller.signal]), capabilities, context: host.sessions.context(linked),
          observer: { event(event) {
            if (event.type === "progress") {
              const run = running.get(ref.id);
              if (run) run.live = event.blocks.map(block => ({ ...structuredClone(block), agentId: ref.id }));
              host.sessions.progressChanged(ref.sessionId);
            }
            return receive(event);
          } },
        }).finally(() => { running.delete(ref.id); host.sessions.progressChanged(ref.sessionId); });
        running.set(ref.id, { sessionId: ref.sessionId, controller, done, live: [] });
        host.sessions.progressChanged(ref.sessionId);
        return done;
      },
      roles: () => { checkAvailable(); return host.registry.roles(); },
      list: () => { checkAvailable(); return host.registry.models(); },
    },
    session,
    object: ref => { own(ref.kind); return object(ref); },
  };
  return {
    context, object,
    declare(contract: RecordContract) {
      if (!belongsTo(internal.id, contract.id)) throw new PluginApiError("foreign_event", "The record contract belongs to another plugin.");
      if (contract.version !== 1) throw new PluginApiError("invalid_argument", "Event storage currently supports contract version 1.");
      const existing = records.get(contract.id);
      if (existing && existing !== contract) throw new Error(`Conflicting record contracts: ${contract.id}`);
      records.set(contract.id, contract);
    },
    activity: (sessionId: string) => {
      const active = [...running].filter(([, run]) => run.sessionId === sessionId);
      return { running: active.map(([id]) => id), live: active.flatMap(([, run]) => run.live) };
    },
    disable: () => { available = false; for (const run of running.values()) run.controller.abort(); },
    async close() {
      closing = true;
      for (const run of running.values()) run.controller.abort();
      await Promise.allSettled([...running.values()].map(run => run.done));
    },
  };
}
export type SdkContext = ReturnType<typeof createSdkContext>;
