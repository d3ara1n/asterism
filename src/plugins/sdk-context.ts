import { belongsTo, jsonSchema, type DataContract, type Json, type RecordContract } from "@atelier/sdk/contracts";
import { PluginApiError, type ObjectReader, type ObjectExecutor, type PluginContext, type ResourceRef, type ResourceSnapshot, type SessionExecutor, type ObjectWriter } from "@atelier/sdk/runtime";
import type { RunGroup } from "./lifecycle.ts";
import type { ObjectScope } from "./host.ts";
import { appendRecord } from "./record-writer.ts";
import type { PluginHostServices } from "./loader.ts";
import { foldWorkbench } from "../session/fold.ts";
import { sessionSnapshot, resourceSnapshot } from "./records.ts";
import { synchronous } from "./synchronous.ts";
import type { LiveBlock } from "../shared/session.ts";

type PluginServices = Pick<PluginContext, "id" | "dir" | "log" | "config" | "secrets" | "db" | "tasks">;
export function createSdkContext(internal: PluginServices, host: PluginHostServices, modelRuns: RunGroup) {
  const records = new Map<string, RecordContract>();
  const running = new Map<string, { sessionId: string; live: LiveBlock[] }>();
  let available = true;
  const checkAvailable = () => {
    if (!available) throw new PluginApiError("unavailable", "The plugin is not available.");
  };
  const own = (kind: string) => {
    if (!belongsTo(internal.id, kind)) throw new PluginApiError("foreign_resource", "The resource belongs to another plugin.");
  };
  const checkRef = (ref: ResourceRef, provisional = false) => {
    checkAvailable();
    const actual = host.refOf(ref.id);
    if (!actual && provisional) return;
    if (!actual || actual.sessionId !== ref.sessionId || actual.kind !== ref.kind)
      throw new PluginApiError("unavailable", "The resource reference is no longer valid.");
  };
  const checkData = (contract: DataContract) => {
    if (!belongsTo(internal.id, contract.id)) throw new PluginApiError("foreign_resource", "The data contract belongs to another plugin.");
  };
  const readData = <T extends Json>(id: string, objectId: string | null, contract: DataContract<T>): T | null => {
    checkAvailable(); checkData(contract);
    host.sessions.title(id);
    let raw: Json | null;
    try { raw = host.data.get(id, objectId, contract.id); }
    catch { throw new PluginApiError("unavailable", "The stored session data is unavailable."); }
    if (raw === null) return null;
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) throw new PluginApiError("unavailable", "The stored session data does not match its contract schema.");
    return parsed.data;
  };
  const checkExecution = (scope?: ObjectScope) => {
    checkAvailable();
    if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The tool execution scope is closed.");
  };
  const session = (id: string, objectId?: string, checkMutation = checkAvailable): SessionExecutor => ({
    id,
    get: contract => readData(id, null, contract),
    resume: () => { checkMutation(); host.sessions.resume(id, objectId); },
    snapshot() {
      checkAvailable();
      return sessionSnapshot(id, host.sessions.title(id), host.sessions.nodes(id), host.sessions.path(id), host.sessions.canResume(id, objectId));
    },
    title: {
      get: () => { checkAvailable(); return host.sessions.title(id); },
      propose: (text, options) => { checkMutation(); return host.sessions.proposeTitle(id, text, options.expected); },
    },
    commit: work => { checkMutation(); commit(id, work); },
  });
  function commit(id: string, work: (writer: ObjectWriter) => unknown, ref?: ResourceRef, scope?: ObjectScope): void {
    checkAvailable();
    if (ref) {
      own(ref.kind); checkRef(ref, scope?.active && scope.provisional);
      if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The tool execution scope is closed.");
      if (!(scope?.active && (scope.provisional || scope.execution)) && !foldWorkbench(host.sessions.path(id)).objects.some(object => object.id === ref.id))
        throw new PluginApiError("unavailable", "The resource is not on the current session path.");
    }
    host.sessions.commit(id, writer => {
      if (scope?.before) { scope.before(); scope.before = undefined; scope.provisional = false; }
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
            if (contract !== declared)
              throw new PluginApiError("invalid_argument", "Use the declared record contract instance.");
            const parsed = declared.schema.safeParse(data);
            if (!parsed.success) throw new PluginApiError("invalid_argument", "The record does not match its declared schema.");
            return appendRecord(writer, declared, jsonSchema.parse(parsed.data), ref);
          },
          set(contract, data) {
            check();
            checkData(contract);
            const parsed = contract.schema.safeParse(data);
            if (!parsed.success) throw new PluginApiError("invalid_argument", "The data does not match its contract schema.");
            host.data.set(id, ref?.id ?? null, contract.id, jsonSchema.parse(parsed.data));
          },
        }));
      } finally { active = false; }
    });
  }
  const object = (address: ResourceRef, scope?: ObjectScope, captured?: ResourceSnapshot): ObjectExecutor => {
    const ref = Object.freeze({ ...address });
    checkRef(ref, scope?.active && scope.provisional);
    return {
      ref, session: session(ref.sessionId, ref.id, () => {
        checkExecution(scope); checkRef(ref, scope?.active && scope.provisional);
      }),
      snapshot() {
        checkRef(ref, scope?.active && scope.provisional);
        if (captured) return captured;
        if (scope?.active && scope.provisional && !host.refOf(ref.id)) return null;
        const current = foldWorkbench(host.sessions.path(ref.sessionId)).objects.find(object => object.id === ref.id);
        return current ? resourceSnapshot(ref, current) : null;
      },
      get(contract) {
        own(ref.kind); checkRef(ref, scope?.active && scope.provisional); checkData(contract);
        if (scope?.active && scope.provisional && !host.refOf(ref.id)) {
          try { host.sessions.title(ref.sessionId); } catch { return null; }
        }
        return readData(ref.sessionId, ref.id, contract);
      },
      commit: work => commit(ref.sessionId, work, ref, scope),
      streams: { publish(channel, data) {
        checkExecution(scope);
        own(ref.kind); checkRef(ref, scope?.active && scope.provisional);
        if (!(data instanceof Uint8Array)) throw new PluginApiError("invalid_argument", "Stream data must be a Uint8Array.");
        host.stream?.({ sessionId: ref.sessionId, objectId: ref.id, channel: `${internal.id}/${channel}`, data });
      } },
    };
  };
  const reader = (address: ResourceRef, scope?: ObjectScope, captured?: ResourceSnapshot): ObjectReader => {
    const source = object(address, scope, captured);
    const session = source.session;
    return Object.freeze({
      ref: source.ref, snapshot: source.snapshot, get: source.get,
      session: Object.freeze({ id: session.id, snapshot: session.snapshot, get: session.get,
        title: Object.freeze({ get: session.title.get }) }),
    });
  };
  const context: PluginContext = {
    id: internal.id, dir: internal.dir, log: internal.log,
    config: (schema, defaults, options) => { checkAvailable(); return internal.config(schema, defaults, options); },
    secrets: internal.secrets, db: () => { checkAvailable(); return internal.db(); },
    tasks: {
      start(key, run, options) {
        checkAvailable();
        if (options?.object) { own(options.object.kind); checkRef(options.object); }
        return internal.tasks.start(key, run, options);
      },
      cancel: key => internal.tasks.cancel(key),
      has: key => internal.tasks.has(key),
    },
    catalogs: { get: contract => { checkAvailable(); return host.catalogs?.get(contract) ?? null; } },
    models: {
      validate: request => { checkAvailable(); return host.models.validate(request); },
      stream: request => { checkAvailable(); return host.models.stream(request); },
      run(request) {
        if (modelRuns.closed) throw new PluginApiError("unavailable", "The plugin is closing.");
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
        let progressTimer: ReturnType<typeof setTimeout> | undefined;
        const receive = request.observer.event.bind(request.observer);
        const work = modelRuns.start(signal => host.models.run({ object: ref, target, system, messages, tools, cache, requestParentId: request.requestParentId,
          signal, capabilities, context: host.sessions.context(linked),
          observer: { event(event) {
            if (event.type === "progress") {
              const run = running.get(ref.id);
              if (run) run.live = event.blocks.map(block => ({ ...structuredClone(block), agentId: ref.id }));
              progressTimer ??= setTimeout(() => { progressTimer = undefined; host.sessions.progressChanged(ref.sessionId); }, 32);
            }
            return receive(event);
          } },
        }), { object: ref, signal: request.signal });
        const done = work.done.finally(() => { clearTimeout(progressTimer); running.delete(ref.id); host.sessions.progressChanged(ref.sessionId); });
        running.set(ref.id, { sessionId: ref.sessionId, live: [] });
        host.sessions.progressChanged(ref.sessionId);
        return done;
      },
      roles: () => { checkAvailable(); return host.models.roles(); },
      list: () => { checkAvailable(); return host.models.list(); },
    },
    session,
    object: ref => { own(ref.kind); return object(ref); },
  };
  return {
    context, object, reader,
    declare(contract: RecordContract) {
      if (!belongsTo(internal.id, contract.id)) throw new PluginApiError("foreign_event", "The record contract belongs to another plugin.");
      const existing = records.get(contract.id);
      if (existing && existing !== contract) throw new Error(`Conflicting record contracts: ${contract.id}. Import the same declaration.`);
      if (!existing) records.set(contract.id, contract);
    },
    activity: (sessionId: string) => {
      const active = [...running].filter(([, run]) => run.sessionId === sessionId);
      return { running: active.map(([id]) => id), live: active.flatMap(([, run]) => run.live) };
    },
    disable: () => { available = false; modelRuns.stop(); },
  };
}
export type SdkContext = ReturnType<typeof createSdkContext>;
