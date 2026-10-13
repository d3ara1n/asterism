import { belongsTo, jsonSchema, type DataContract, type Json, type RecordContract } from "@atelier/sdk/contracts";
import { PluginApiError, type ContentReader, type ContentScope, type ObjectReader, type ObjectExecutor, type PluginContext, type ResourceRef, type ResourceSnapshot, type SessionExecutor, type ObjectWriter } from "@atelier/sdk/runtime";
import type { RunGroup } from "./lifecycle.ts";
import type { ObjectScope } from "./host.ts";
import type { PluginHostServices } from "./loader.ts";
import { foldWorkbench } from "../session/fold.ts";
import { sessionSnapshot, resourceSnapshot } from "./records.ts";
import { synchronous } from "./synchronous.ts";
import type { LiveBlock } from "../shared/session.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import { inputReferences } from "../model/input.ts";

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
  /** 内容访问域：已建立对象取当前路径上的记录根；尚未建立身份的对象只有本次作用域。 */
  const access = (sessionId?: string, objectId?: string, scope?: ObjectScope) => {
    const established = !!sessionId && !scope?.provisional;
    const recordIds = established ? new Set(host.sessions.path(sessionId!).map(node => node.id)) : new Set<string>();
    // 动作作用域结束后对象仍按自身记录根与请求交接读取；工具执行作用域关闭后严格拒绝。
    return { owner: internal.id, sessionId, objectId, recordIds, get scope() { return scope?.active ? scope.content : undefined; }, check: () => {
      checkAvailable();
      if (scope?.execution && !scope.active) throw new PluginApiError("unavailable", "The content execution is closed.");
    } };
  };
  const unavailable = async (): Promise<never> => { throw new PluginApiError("unavailable", "Content storage is unavailable."); };
  const missing: ContentScope = Object.freeze({ read: unavailable, async *open() { await unavailable(); }, stage: unavailable });
  const readOnly = (source: ContentReader): ContentReader => Object.freeze({ read: source.read, open: source.open });
  /** 取消信号传到内容占用，等待中的传输随之中止。 */
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
    get: contract => readData(id, null, contract),
    snapshot() {
      checkAvailable();
      return sessionSnapshot(id, host.sessions.title(id), host.sessions.nodes(id), host.sessions.path(id));
    },
    title: {
      get: () => { checkAvailable(); return host.sessions.title(id); },
      set: text => { checkMutation(); host.sessions.setTitle(id, text); },
    },
    commit: work => { checkMutation(); commit(id, work, undefined, scope); },
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
            const value = jsonSchema.parse(parsed.data);
            // 来源由写入通道打戳：插件身份来自操作柄，资源来自已校验的对象引用。
            const recordId = writer.append({ contract: declared.id, data: value, model: null, recipient: null,
              source: { plugin: internal.id, resource: ref ? { id: ref.id, kind: ref.kind } : null } });
            host.content?.bind({ ...access(id, ref?.id, scope), sessionId: id }, { kind: "record", id: recordId }, value);
            return recordId;
          },
          set(contract, data) {
            check();
            checkData(contract);
            const parsed = contract.schema.safeParse(data);
            if (!parsed.success) throw new PluginApiError("invalid_argument", "The data does not match its contract schema.");
            const value = jsonSchema.parse(parsed.data);
            host.content?.bind({ ...access(id, ref?.id, scope), sessionId: id }, { kind: "data", id: contract.id }, value);
            host.data.set(id, ref?.id ?? null, contract.id, value);
          },
        }));
      } finally { active = false; }
    });
  }
  const object = (address: ResourceRef, scope?: ObjectScope, captured?: ResourceSnapshot): ObjectExecutor => {
    const ref = Object.freeze({ ...address });
    checkRef(ref, scope?.active && scope.provisional);
    return {
      ref, content: host.content?.writer(access(ref.sessionId, ref.id, scope)) ?? content(),
      session: session(ref.sessionId, ref.id, () => {
        checkExecution(scope); checkRef(ref, scope?.active && scope.provisional);
      }, scope),
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
      content: Object.freeze({ read: source.content.read, open: source.content.open }),
      session: Object.freeze({ id: session.id, content: session.content, snapshot: session.snapshot, get: session.get,
        title: Object.freeze({ get: session.title.get }) }),
    });
  };
  const context: PluginContext = {
    id: internal.id, dir: internal.dir, log: internal.log,
    config: contract => {
      checkAvailable();
      if (contract.plugin !== internal.id) throw new PluginApiError("foreign_resource", "The configuration belongs to another plugin.");
      return internal.config(contract);
    },
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
      validate: (request, options) => {
        checkAvailable();
        return modelRuns.start(signal => host.models.validate({ ...request, signal }, {
          content: messages => host.content?.captureReader(inputReferences(messages), options?.content, internal.id),
        }), { signal: request.signal, affectsHistory: false }).done;
      },
      stream: (request, options) => {
        checkAvailable();
        return modelRuns.iterate(signal => host.models.stream({ ...request, signal }, {
          content: messages => host.content?.captureReader(inputReferences(messages), options?.content, internal.id),
        }), request.signal);
      },
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
        const work = modelRuns.start(signal => host.models.run({ plugin: internal.id, object: ref, target, system, messages, tools, cache, requestParentId: request.requestParentId,
          signal, capabilities, context: host.sessions.context(linked),
          content: messages => host.content?.capture(inputReferences(messages), { owner: internal.id, sessionId: ref.sessionId,
            objectId: ref.id, recordIds: new Set(path.map(node => node.id)), check: checkAvailable }),
          handover: () => host.content?.handover(ref.sessionId, ref.id),
          observer: { event(event) {
            if (event.type === "progress") {
              const run = running.get(ref.id);
              if (run) run.live = event.blocks.map(block => ({ ...structuredClone(block), objectId: ref.id }));
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
    object: (sessionId, contract, id) => { own(contract.kind); return object({ sessionId, id, kind: contract.kind }); },
  };
  return {
    context, object, reader, content, linkAbort,
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
