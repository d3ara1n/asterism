import { belongsTo, jsonSchema, type DataContract, type Json, type RecordContract } from "@asterism-app/sdk/contracts";
import { PluginApiError, type ContentReader, type ContentScope, type ObjectReader, type ObjectExecutor, type PluginContext,
  type ResourceRef, type ResourceSnapshot, type SessionExecutor, type ObjectWriter, type ToolSession } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { ObjectScope } from "../host.ts";
import type { PluginHostServices } from "../loader.ts";
import type { PluginEventScope } from "../event-scope.ts";
import type { ContentLease } from "../../runtime/content-store.ts";
import { sessionSnapshot, resourceSnapshot } from "../records.ts";
import { synchronous } from "../synchronous.ts";
import { SessionError } from "../../session/tree.ts";
import { encodePluginData } from "../data-encoding.ts";

/** Object and session operations share identity checks, content authority, and synchronous write scopes. */
export function bindObjects(owner: string, host: PluginHostServices, sessionRuns: RunGroup, eventScope: PluginEventScope, checkAvailable: () => void) {
  const records = new Map<string, RecordContract>();
  const outside = { affectsHistory: false } as const;
  const sessionError = (error: unknown): never => {
    if (error instanceof SessionError) throw new PluginApiError(
      error.code === "conflict" || error.code === "not_found" ? error.code
        : error.code === "invalid_request" ? "invalid_argument" : "unavailable", error.message,
      ["conflict", "not_found", "invalid_request", "unavailable"].includes(error.code) ? undefined : error.code, error.display);
    throw error;
  };
  const own = (kind: string) => {
    if (!belongsTo(owner, kind)) throw new PluginApiError("foreign_resource", "The resource belongs to another plugin.");
  };
  const checkRef = (ref: ResourceRef, provisional = false) => {
    checkAvailable();
    const actual = host.refOf(ref.id);
    if (!actual && provisional) return;
    if (!actual || actual.sessionId !== ref.sessionId || actual.kind !== ref.kind)
      throw new PluginApiError("unavailable", "The resource reference is no longer valid.");
  };
  const checkData = (contract: DataContract) => {
    if (!belongsTo(owner, contract.id)) throw new PluginApiError("foreign_resource", "The data contract belongs to another plugin.");
  };
  const readData = <T extends Json>(id: string, objectId: string | null, contract: DataContract<T>): T | null => {
    checkAvailable(); checkData(contract);
    host.sessions.title(id);
    let raw: Json | undefined;
    try { raw = host.data.get(id, objectId, contract.id); }
    catch { throw new PluginApiError("unavailable", "The stored session data is unavailable."); }
    if (raw === undefined) return null;
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) throw new PluginApiError("unavailable", "The stored session data does not match its contract schema.");
    return parsed.data;
  };
  const checkExecution = (scope?: ObjectScope) => {
    checkAvailable();
    if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The tool execution scope is closed.");
  };
  /** Content access scope: established objects use record roots on the current path; objects without established identity have only this scope. */
  const access = <S extends string | undefined>(sessionId: S, objectId?: string, scope?: ObjectScope) => {
    const established = !!sessionId && !scope?.provisional;
    const view = established ? host.sessions.view(sessionId!) : undefined;
    // After action scopes end, objects still read through their own record roots and request handoffs; closed tool execution scopes reject strictly.
    return { owner, sessionId, objectId,
      // Associating objects from other plugins grants no access to their in-flight staged content; history and current-data roots validate ownership separately.
      allowHandover: !objectId || belongsTo(owner, host.refOf(objectId)?.kind ?? ""),
      get recordIds() { return new Set(view?.timelineIds()); },
      get scope() { return scope?.active ? scope.content : undefined; }, check: () => {
      checkAvailable();
      if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The content execution is closed.");
    } };
  };
  const unavailable = async (): Promise<never> => { throw new PluginApiError("unavailable", "Content storage is unavailable."); };
  const missing: ContentScope = Object.freeze({ read: unavailable, async *open() { await unavailable(); }, stage: unavailable });
  const readOnly = (source: ContentReader): ContentReader => Object.freeze({ read: source.read, open: source.open });
  /** Propagate cancellation signals to content holds and abort waiting transfers. */
  const linkAbort = (lease: ContentLease | undefined, signal: AbortSignal) => {
    if (!lease) return;
    if (signal.aborted) lease.controller.abort();
    else signal.addEventListener("abort", () => lease.controller.abort(), { once: true });
  };
  const content = (lease?: ContentLease, ref?: ResourceRef, signal?: AbortSignal): ContentScope => {
    if (signal) linkAbort(lease, signal);
    const context = access(ref?.sessionId, ref?.id, lease || ref ? { active: true, content: lease, provisional: !ref || !host.refOf(ref.id) } : undefined);
    return host.content?.writer(context) ?? missing;
  };
  const session = (id: string, objectId?: string, checkMutation = checkAvailable, scope?: ObjectScope): SessionExecutor => ({
    id,
    content: readOnly(host.content?.reader(access(id, undefined, scope)) ?? missing),
    async invoke(contract, target, input, options = {}) {
      checkMutation();
      const ref = Object.freeze({ ...target });
      if (ref.sessionId !== id) throw new PluginApiError("invalid_argument", "The resource belongs to another session.");
      checkRef(ref);
      const value = jsonSchema.parse(input);
      const contentReader = options.content ?? host.content?.reader(access(id, objectId, scope));
      return sessionRuns.start(async signal => {
        signal.throwIfAborted();
        try {
          await host.sessions.invoke(id, contract, ref, value, {
            signal, content: contentReader, owner, check: checkMutation,
          });
        } catch (error) { sessionError(error); }
      }, { object: ref, signal: options.signal }).done;
    },
    create(contract, input, options = {}) {
      checkMutation();
      const value = jsonSchema.parse(input);
      const linkTo = options.linkTo && Object.freeze({ ...options.linkTo });
      const resources = options.resources?.map(resource => Object.freeze({ ...resource }));
      const contentReader = options.content ?? host.content?.reader(access(id, objectId, scope));
      return sessionRuns.start(async signal => {
        try {
          return await host.sessions.create(id, contract, value, {
            signal, linkTo, resources, content: contentReader, owner, check: checkMutation,
          });
        } catch (error) { return sessionError(error); }
      }, { signal: options.signal, ...(objectId ? { object: host.refOf(objectId) ?? undefined } : {}) }).done;
    },
    link(receiver, resource) {
      checkMutation();
      try { host.sessions.link(id, receiver, resource, true); } catch (error) { sessionError(error); }
    },
    unlink(receiver, resource) {
      checkMutation();
      try { host.sessions.link(id, receiver, resource, false); } catch (error) { sessionError(error); }
    },
    remove(resource) {
      checkMutation();
      try { host.sessions.remove(id, resource); } catch (error) { sessionError(error); }
    },
    rename(resource, title) {
      checkMutation();
      try { return host.sessions.rename(id, resource, title); } catch (error) { return sessionError(error); }
    },
    get: contract => readData(id, null, contract),
    snapshot() {
      checkAvailable();
      return sessionSnapshot(host.sessions.view(id));
    },
    title: {
      get: () => { checkAvailable(); return host.sessions.title(id); },
      set: (text, detail) => {
        checkMutation();
        if (detail) own(detail.contract.id);
        host.sessions.setTitle(id, text, { plugin: owner, resource: objectId ? host.refOf(objectId) : null }, detail);
      },
    },
    commit: work => { checkMutation(); commit(id, work, undefined, scope); },
  });
  function commit(id: string, work: (writer: ObjectWriter) => unknown, ref?: ResourceRef, scope?: ObjectScope): void {
    checkAvailable();
    if (ref) {
      own(ref.kind); checkRef(ref, scope?.active && scope.provisional);
      if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The tool execution scope is closed.");
      if (!(scope?.active && (scope.provisional || scope.execution)) && !host.sessions.workbench(id).objects.some(object => object.id === ref.id))
        throw new PluginApiError("unavailable", "The resource is not on the current session path.");
    }
    host.sessions.commit(id, writer => {
      if (scope?.before) { scope.before(); scope.before = undefined; scope.provisional = false; }
      let active = true;
      const check = () => {
        if (!active) throw new PluginApiError("unavailable", "The writer is outside its commit callback.");
      };
      const captureInput = (value: Json) => {
        if (scope?.input && scope.content) host.content?.retain(scope.content, value, scope.input, owner);
      };
      const declaredRecord = (contract: RecordContract) => {
        const declared = records.get(contract.id);
        if (!declared || !belongsTo(owner, contract.id))
          throw new PluginApiError("foreign_event", "The plugin did not declare this record contract.");
        if (contract !== declared)
          throw new PluginApiError("invalid_argument", "Use the declared record contract instance.");
        return declared;
      };
      const append = (contract: RecordContract, data: Json, pending?: true) => {
        check();
        const declared = declaredRecord(contract);
        const value = encodePluginData(declared, data);
        captureInput(value);
        const recordId = writer.append({ contract: declared.id, data: value, model: null, recipient: null,
          source: { plugin: owner, resource: ref ?? null }, ...(pending ? { pending } : {}) });
        host.content?.bind(access(id, ref?.id, scope), { kind: "record", id: recordId }, value);
        return recordId;
      };
      try {
        synchronous(() => work({
          append(contract, data) {
            return append(contract, data);
          },
          begin(contract, input) {
            check();
            if (!("outputSchema" in declaredRecord(contract)))
              throw new PluginApiError("invalid_argument", "Use an operation record contract.");
            return append(contract, { input, output: null }, true);
          },
          complete(contract, recordId, output, options) {
            check();
            if (!("outputSchema" in declaredRecord(contract)))
              throw new PluginApiError("invalid_argument", "Use an operation record contract.");
            writer.complete(recordId, record => {
              if (record.contract !== contract.id || record.source?.plugin !== owner
                || (ref && record.source.resource?.id !== ref.id))
                throw new PluginApiError("foreign_event", "The operation record belongs to another writer.");
              const original = contract.schema.safeParse(record.data);
              if (!original.success) throw new PluginApiError("unavailable", "The operation record does not match its contract.");
              const value = encodePluginData({ id: contract.id, schema: contract.outputSchema }, output);
              captureInput(value);
              host.content?.bind(access(id, record.source.resource?.id, scope), { kind: "record", id: recordId }, value, options?.content);
              // Preserve the original encoded input even when its schema uses a codec.
              return { ...(record.data as { input: Json; output: Json }), output: value };
            });
          },
          set(contract, data) {
            check();
            checkData(contract);
            const value = encodePluginData(contract, data);
            captureInput(value);
            host.content?.bind(access(id, ref?.id, scope), { kind: "data", id: contract.id }, value);
            host.data.set(id, ref?.id ?? null, contract.id, value);
          },
        }));
      } finally { active = false; }
    }, ref?.id);
  }
  const object = (address: ResourceRef, scope?: ObjectScope, captured?: ResourceSnapshot): ObjectExecutor => {
    const ref = Object.freeze({ ...address });
    checkRef(ref, scope?.active && scope.provisional);
    return {
      ref, content: host.content?.writer(access(ref.sessionId, ref.id, scope)) ?? content(),
      events: { publish(contract, data) {
        checkExecution(scope); own(ref.kind);
        if (!(scope?.active && (scope.provisional || scope.execution))) {
          // Identity was checked on binding; the hot path checks only the current workbench without scanning all session history.
          const actual = host.sessions.workbench(ref.sessionId).objects.find(object => object.id === ref.id);
          if (!actual || actual.kind !== ref.kind) throw new PluginApiError("unavailable", "The event resource is no longer available.");
        }
        eventScope.publish(contract, data, { plugin: owner, resource: ref });
      } },
      session: session(ref.sessionId, ref.id, () => {
        checkExecution(scope); checkRef(ref, scope?.active && scope.provisional);
      }, scope),
      snapshot() {
        checkRef(ref, scope?.active && scope.provisional);
        if (captured) return captured;
        if (scope?.active && scope.provisional && !host.refOf(ref.id)) return null;
        const current = host.sessions.workbench(ref.sessionId).objects.find(object => object.id === ref.id);
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
      withBusy(work, options = {}) {
        checkExecution(scope); own(ref.kind); checkRef(ref);
        if (!host.sessions.workbench(ref.sessionId).objects.some(item => item.id === ref.id))
          throw new PluginApiError("unavailable", "The resource is not on the current session path.");
        return sessionRuns.start(work, { object: ref, signal: options.signal }).done;
      },
      invalidate() {
        checkExecution(scope); own(ref.kind); checkRef(ref);
        host.sessions.viewChanged(ref.sessionId, ref.id);
      },
    };
  };
  const reader = (address: ResourceRef, scope?: ObjectScope, captured?: ResourceSnapshot): ObjectReader => {
    const source = object(address, scope, captured);
    const session = source.session;
    return Object.freeze({
      ref: source.ref, snapshot: source.snapshot, get: source.get,
      content: Object.freeze({ read: source.content.read, open: source.content.open }),
      session: Object.freeze({ id: session.id, content: session.content, snapshot: session.snapshot, get: session.get,
        title: Object.freeze({ get: session.title.get }) }),
    });
  };
  const createSession: PluginContext["createSession"] = (key, prepare, options = {}) => {
    checkAvailable();
    return sessionRuns.start(signal => host.sessions.initialize(owner, key, async preparation => {
      const initialization = await prepare(preparation);
      return { title: initialization.title, initialize(id, create, content) {
        const scope: ObjectScope = { active: true, execution: true, content, input: options.content };
        const bound = session(id, undefined, checkAvailable, scope);
        try {
          synchronous(() => initialization.initialize({
            id, content: bound.content, snapshot: bound.snapshot, get: bound.get, title: { get: bound.title.get }, create,
            object(contract, objectId) {
              own(contract.kind);
              const ref = { sessionId: id, kind: contract.kind, id: objectId };
              checkRef(ref);
              const executor = object(ref, scope);
              return { ...reader(ref, scope), commit: executor.commit };
            },
          }));
        } finally { scope.active = false; }
      } };
    }, { signal, content: options.content }), { ...outside, signal: options.signal }).done;
  };
  return {
    own, checkRef, session, createSession, object, reader, content, linkAbort,
    toolSession(ref: ResourceRef, linked: readonly ResourceRef[], scope: ObjectScope, signal: AbortSignal): ToolSession {
      const check = () => {
        checkExecution(scope); signal.throwIfAborted(); checkRef(ref);
        if (!host.sessions.workbench(ref.sessionId).objects.some(resource => resource.id === ref.id))
          throw new PluginApiError("unavailable", "The invoking resource is no longer on the current session path.");
      };
      const source = session(ref.sessionId, ref.id, check, scope);
      const authorized = (resourceId: string) => {
        const target = linked.find(resource => resource.id === resourceId);
        if (!target) throw new PluginApiError("rejected", "Resource access requires a link in this request's resource scope.", "access_denied");
        return target;
      };
      return Object.freeze({
        ...reader(ref, scope).session,
        create: ((contract, input, options = {}) => {
          check();
          const resources = [...new Set(options.resources ?? [])].map(authorized);
          if (options.exposeSelf === true) resources.push(ref);
          return source.create(contract, input, { signal, linkTo: ref, resources });
        }) as ToolSession["create"],
        remove(resourceId: string) {
          check();
          source.remove(authorized(resourceId));
        },
        rename(resourceId: string, title: string) {
          check();
          return source.rename(authorized(resourceId), title);
        },
      });
    },
    declare(contract: RecordContract) {
      if (!belongsTo(owner, contract.id)) throw new PluginApiError("foreign_event", "The record contract belongs to another plugin.");
      const existing = records.get(contract.id);
      if (existing && existing !== contract) throw new Error(`Conflicting record contracts: ${contract.id}. Import the same declaration.`);
      if (!existing) records.set(contract.id, contract);
    },
  };
}
export type SdkObjects = ReturnType<typeof bindObjects>;
