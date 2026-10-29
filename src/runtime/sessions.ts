import { createSharedServices } from "./shared-services.ts";
import { SessionTitleAssigned, type Presentation, type Source, resourceCall, resourceTitleSchema, jsonSchema, type ActionContract, type CreationContract, type ResourceCall, type ResourceCreationResult, type Json, type ModelInputPart, ResourceStatusChanged, SessionTitleChanged } from "@asterism-app/sdk/contracts";
import { type ResourceRef, type PluginDefinition, type ResourceCreationOptions, type ResourceActionOptions, type ManualSource, type PreparedCreation, PluginApiError } from "@asterism-app/sdk/runtime";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { ConfigurationService } from "../configuration/service.ts";
import { AgentCapabilities } from "../execution/capabilities.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { inputReferences } from "../model/input.ts";
import { loadPlugins } from "../plugins/loader.ts";
import type { ParsedCall } from "../plugins/commands.ts";
import type { SessionHost, SessionHostWriter as SessionWriter } from "../plugins/host.ts";
import type { PluginManifest, LoadedPlugins, PreparedPluginStorage } from "../plugins/loader.ts";
import { createModelServices } from "../plugins/models.ts";
import { createResourceId } from "../resources/id.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import { SessionDataStore } from "../session/data.ts";
import type { FoldedObject } from "../session/fold.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import type { ModelSettings } from "../shared/model.ts";
import { sessionCommandSchema, type SessionChanged, type SessionCommand, type SessionData, type SessionProgress, type SessionReply, type SessionNode } from "../shared/session.ts";
import { diffLive } from "../shared/live-patch.ts";
import { wireLive } from "../shared/partial-arguments.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { sessionPluginError } from "./plugin-errors.ts";
import { SessionWorkbench } from "./workbench.ts";
import { ContentStore, type ContentLease, type ContentTarget } from "./content-store.ts";
import { applicationStorage } from "../shared/application.ts";
import { EventBus } from "../plugins/events.ts";
import { TemplateStore } from "./templates.ts";

export interface SessionServiceOptions {
  onChanged?: (event: SessionChanged) => void;
  adapterFactory?: (settings: ModelSettings) => ModelAdapter;
  plugins?: readonly PluginDefinition[];
  configurationChanged?: (pluginId: string) => void;
  preparedStorage?: PreparedPluginStorage;
  manualSources?: () => readonly ManualSource[];
  pluginDependencies?: ReadonlyMap<string, readonly string[]>;
  packageRoots?: ReadonlyMap<string, string>;
  /** User skill directories; tests leave this empty to stay isolated from the real user profile. */
  skillDirectories?: readonly string[];
}


/**
 * Session application entry: compose built-in domain interfaces and provide session trees, workbench events, layout, and notifications.
 * Resource controllers own behavior, including agent submission, execution, and configuration; sessions route commands by object type.
 */
export class SessionService {
  readonly calls: LoadedPlugins["calls"];
  readonly channels: LoadedPlugins["channels"];
  readonly events = new EventBus();
  private readonly watching = new Map<string, SessionProgress>();
  private readonly updates = new Map<string, { nodes: SessionNode[]; objects: Set<string>; workbench: boolean; layout: boolean }>();
  private closed = false;
  private readonly shared: ReturnType<typeof createSharedServices>;
  private readonly changed: (event: SessionChanged) => void;
  readonly tree: SessionTree;
  readonly content: ContentStore;
  readonly templates: TemplateStore;
  private readonly workbench: SessionWorkbench;
  private readonly resources: ResourceRegistry;
  private readonly tools: ToolRegistry;
  readonly plugins: readonly PluginManifest[];
  readonly configurePlugins: LoadedPlugins["configure"];
  private readonly closePlugins: () => Promise<void>;
  private readonly releasePlugins: LoadedPlugins["release"];
  private readonly restorePlugins: LoadedPlugins["restore"];
  /** Entry pending: do not reenter archive cleanup for the same session while it is in progress. */
  private readonly archiving = new Set<string>();
  private readonly prepare: LoadedPlugins["prepare"];
  private readonly afterCommit: LoadedPlugins["afterCommit"];
  private readonly pluginActivity: LoadedPlugins["activity"];
  constructor(private readonly db: DatabaseSync, dataRoot: string, configuration: ConfigurationService, options: SessionServiceOptions = {}) {
    this.changed = options.onChanged ?? (() => {});
    this.tree = new SessionTree(db);
    this.events.declarePublic(SessionTitleChanged);
    this.events.declarePublic(ResourceStatusChanged);
    this.shared = createSharedServices({ db, dataRoot, configuration, events: this.events,
      manualSources: options.manualSources ?? (() => []), packageRoots: options.packageRoots ?? new Map(), skillDirectories: options.skillDirectories ?? [] });
    this.content = new ContentStore(db, join(dataRoot, applicationStorage.contentDirectory));
    this.content.collectStartup();
    const host: SessionHost = {
      initialize: (owner, key, prepare, options) => this.initializeSession(owner, key, prepare, options),
      list: () => {
        if (this.writesClosed) throw new PluginApiError("unavailable", "The session service is closed.");
        return this.tree.list();
      },
      archived: () => {
        if (this.writesClosed) throw new PluginApiError("unavailable", "The session service is closed.");
        return this.tree.archived();
      },
      create: (sessionId, contract, input, options) => this.createFromPlugin(sessionId, contract, input, options),
      invoke: (sessionId, contract, target, input, options) => this.invokeFromPlugin(sessionId, contract, target, input, options),
      link: (sessionId, receiver, resource, linked) => this.setLink(sessionId, receiver, resource, linked),
      remove: (sessionId, resource) => this.removeResource(sessionId, resource),
      rename: (sessionId, resource, title) => this.renameResource(sessionId, resource, title),
      view: sessionId => this.tree.view(sessionId),
      sequences: (sessionId, nodes) => this.tree.sequences(sessionId, nodes),
      timeline: sessionId => this.tree.timeline(sessionId),
      workbench: sessionId => this.tree.workbench(sessionId),
      title: sessionId => this.tree.title(sessionId),
      setTitle: (sessionId, text, source, detail) => this.assignTitle(sessionId, text, source, detail),
      commit: (sessionId, work, objectId) => this.commit(sessionId, work, { objectId }),
      idle: (sessionId, objectId) => !this.pluginActivity(sessionId).busy.some(id => id !== objectId)
        && !this.resources.controllers().some(controller => controller.activity?.(sessionId).busy.some(id => id !== objectId)),
      progressChanged: sessionId => this.progressChanged(sessionId),
      viewChanged: (sessionId, objectId) => {
        if (this.committing?.sessionId === sessionId) { this.committing.objects.add(objectId); return; }
        if (!this.watching.has(sessionId)) return;
        this.pendingUpdate(sessionId).objects.add(objectId);
        this.notify(sessionId);
      },
      linked: (sessionId, objectId) => {
        const folded = this.tree.workbench(sessionId);
        const ids = new Set(folded.links.filter(link => link.receiverId === objectId).map(link => link.resourceId));
        return folded.objects.filter(object => ids.has(object.id));
      },
      capabilities: (linked, policy, caller) => new AgentCapabilities(this.resources, this.tools, linked, policy, caller),
      context: linked => this.resources.context(linked),
    };
    const refOf = (objectId: string): ResourceRef | null => this.tree.resourceRef(objectId);
    const models = createModelServices(configuration, options.adapterFactory);
    const modules = loadPlugins(options.plugins ?? [], { events: this.events, extensionsDirectory: join(dataRoot, "extensions"), data: new SessionDataStore(db), content: this.content, refOf,
      vault: configuration.vault, configurationChanged: options.configurationChanged, preparedStorage: options.preparedStorage,
      pluginDependencies: options.pluginDependencies, sessions: host, models, shared: this.shared });
    this.resources = modules.resources;
    this.calls = modules.calls;
    this.channels = modules.channels;
    this.tools = modules.tools;
    this.plugins = modules.manifest;
    this.configurePlugins = modules.configure;
    this.closePlugins = modules.close;
    this.releasePlugins = modules.release;
    this.restorePlugins = modules.restore;
    this.afterCommit = modules.afterCommit;
    this.prepare = modules.prepare;
    this.pluginActivity = modules.activity;
    this.workbench = new SessionWorkbench(db, this.tree, this.resources,
      (sessionId, receiverId, resource) => this.linkTools(sessionId, receiverId, resource), this.content);
    this.templates = new TemplateStore(db, this.tree, this.workbench, this.content, this.resources);
    modules.initialize();
  }
  get running(): boolean { return this.tree.list().some(session => !this.settled(session.id)); }
  disposalWarnings() {
    return this.tree.list().flatMap(session => this.tree.workbench(session.id).objects.flatMap(object => {
      const warning = this.resources.disposalWarning(object);
      return warning ? [{ title: object.title, warning }] : [];
    }));
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  /** Single-writer synchronous commit interval: parent lookup, event recording, and cursor updates cannot interleave. */
  private committing: { sessionId: string; writer: SessionWriter; objects: Set<string> } | null = null;
  private writesClosed = false;
  private commit<T>(sessionId: string, work: (writer: SessionWriter) => T,
    scope: { objectId?: string; workbench?: boolean; layout?: boolean } = {}): T {
    if (this.writesClosed) throw new SessionError("unavailable", "The session service is closed.");
    if (this.committing) {
      if (this.committing.sessionId !== sessionId) throw new SessionError("conflict", "A commit cannot write another session.");
      this.db.exec("SAVEPOINT nested_session_commit");
      try {
        const result = work(this.committing.writer);
        this.db.exec("RELEASE nested_session_commit");
        if (scope.objectId) this.committing.objects.add(scope.objectId);
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK TO nested_session_commit; RELEASE nested_session_commit");
        throw error;
      }
    }
    const head = this.tree.head(sessionId), before = this.tree.position(sessionId), titleBefore = this.tree.titleOf(sessionId);
    const writer: SessionWriter = {
      append: node => this.tree.appendToTimeline(sessionId, node).id,
      nodes: () => this.tree.nodes(sessionId),
    };
    const objects = new Set<string>();
    if (scope.objectId) objects.add(scope.objectId);
    const result = this.transaction(() => {
      this.committing = { sessionId, writer, objects };
      try {
        const result = work(writer);
        // Presence and links affect execution validation; rebuild after successful commits and before observer dispatch.
        this.tree.workbench(sessionId);
        return result;
      }
      finally { this.committing = null; }
    });
    // Titles use actual values after the outermost commit succeeds; rolled-back commits never reach here.
    const title = this.tree.titleOf(sessionId);
    if (!this.closed && title !== null && title !== titleBefore) this.events.publish(SessionTitleChanged, null, { sessionId, title });
    // Hand off to the plugin dispatch queue after commit; observer commits queue and each session notifies the UI once after draining.
    const change = { records: this.tree.since(sessionId, head), cursorChanged: before !== this.tree.position(sessionId) };
    if (this.watching.has(sessionId)) {
      const update = this.pendingUpdate(sessionId);
      update.nodes.push(...change.records);
      for (const objectId of objects) update.objects.add(objectId);
      for (const node of change.records) {
        if (node.source?.resource) update.objects.add(node.source.resource.id);
      }
      update.workbench ||= !!scope.workbench || change.records.some(node =>
        ["resource_created", "resource_renamed", "object_removed", "resource_attached", "resource_detached"].includes(node.contract));
      update.layout ||= !!scope.layout;
    }
    if (this.closed) this.notify(sessionId);
    else this.afterCommit(sessionId, change, id => this.notify(id));
    return result;
  }
  /** A session is settled when no resource is active; only then is backtracking allowed. */
  private settled(sessionId: string): boolean {
    return ![...this.pendingCreations.values()].some(value => value.sessionId === sessionId)
      && ![...this.pendingActions.values()].some(ref => ref.sessionId === sessionId)
      && this.pluginActivity(sessionId).busy.length === 0
      && this.resources.controllers().every(controller => (controller.activity?.(sessionId).busy.length ?? 0) === 0);
  }
  private notify(sessionId: string): void {
    const update = this.updates.get(sessionId);
    this.updates.delete(sessionId);
    if (!update || !this.watching.has(sessionId) || this.closed) return;
    const title = this.tree.title(sessionId);
    this.changed({ kind: "session.changed", sessionId, nodes: update.nodes, title, cursor: this.tree.cursor(sessionId),
      objects: update.workbench ? [] : [...update.objects].flatMap(id => {
        const object = this.workbench.object(sessionId, id);
        return object ? [object] : [];
      }),
      ...(update.workbench ? { workbench: this.workbench.project(sessionId, title) } : {}),
      ...(update.layout && !update.workbench ? { layout: this.workbench.layout(sessionId) } : {}),
    });
  }
  private pendingUpdate(sessionId: string) {
    let update = this.updates.get(sessionId);
    if (!update) { update = { nodes: [], objects: new Set<string>(), workbench: false, layout: false }; this.updates.set(sessionId, update); }
    return update;
  }
  private progress(sessionId: string): SessionProgress {
    const resources = this.resources.controllers().map(controller => controller.activity?.(sessionId) ?? { busy: [], live: [] });
    const plugin = this.pluginActivity(sessionId);
    return {
      busyObjectIds: [...new Set([...resources.flatMap(a => a.busy), ...plugin.busy,
        ...[...this.pendingActions.values()].filter(ref => ref.sessionId === sessionId).map(ref => ref.id)])],
      timelineBusy: [...this.pendingCreations.values()].some(item => item.sessionId === sessionId),
      // During input, tool arguments travel only as argumentsText; the frontend derives previews.
      live: [...resources.flatMap(a => a.live), ...plugin.live].map(wireLive) };
  }
  private progressChanged(sessionId: string): void {
    const previous = this.watching.get(sessionId);
    if (!previous || this.closed) return;
    const progress = this.progress(sessionId);
    // Deliver streaming text as block deltas: appends send only tails and unchanged blocks are not resent.
    const live = diffLive(previous.live, progress.live);
    if (!live && previous.timelineBusy === progress.timelineBusy
      && previous.busyObjectIds.length === progress.busyObjectIds.length
      && previous.busyObjectIds.every(id => progress.busyObjectIds.includes(id))) return;
    this.watching.set(sessionId, progress);
    this.changed({ kind: "session.progress", sessionId, busyObjectIds: progress.busyObjectIds, timelineBusy: progress.timelineBusy, live });
  }
  private linkTools(sessionId: string, receiverId: string, resource: FoldedObject) {
    const recipient = this.object(sessionId, receiverId);
    return this.resources.controller(recipient.kind)?.linkTools?.(sessionId, receiverId, resource) ?? [];
  }
  current(sessionId: string): SessionData {
    const nodes = this.tree.nodes(sessionId);
    const cursor = this.tree.cursor(sessionId);
    const title = this.tree.title(sessionId);
    return { sessionId, title, cursor, nodes, progress: this.progress(sessionId),
      workbench: this.workbench.project(sessionId, title) };
  }
  /** Resource command entry: prepare outside transactions, then before rechecks current-path membership within the execution commit transaction. */
  private async invoke(sessionId: string, objectId: string, raw: ResourceCall, inputScopeId?: string): Promise<void> {
    const resource = this.object(sessionId, objectId);
    const controller = this.resources.controller(resource.kind);
    if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
    const content = this.content.fork(inputScopeId, { kind: "resource", sessionId, objectId, resourceKind: resource.kind, contractId: raw.id });
    await this.invokeResource({ sessionId, id: objectId, kind: resource.kind }, raw, content);
  }
  /** Frontend and backend actions share preparation and object queues; this content hold covers preparation, queuing, and actual execution. */
  private async invokeResource(ref: ResourceRef, raw: ResourceCall, content: ContentLease,
    options: { signal?: AbortSignal; check?(): void } = {}): Promise<void> {
    const pending = Symbol();
    const abortContent = () => content.controller.abort();
    options.signal?.addEventListener("abort", abortContent, { once: true });
    try {
      options.signal?.throwIfAborted(); options.check?.();
      const resource = this.requireRef(ref.sessionId, ref);
      const controller = this.resources.controller(ref.kind);
      if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
      controller.assertActionEntry?.(ref.id);
      this.pendingActions.set(pending, ref);
      this.progressChanged(ref.sessionId);
      const command = await this.prepareCommand(ref.kind, raw, { sessionId: ref.sessionId, objectId: ref.id, content }, options.signal);
      options.signal?.throwIfAborted(); options.check?.();
      await controller.execute({ sessionId: ref.sessionId, resource, signal: options.signal }, command, () => {
        options.check?.(); this.requireRef(ref.sessionId, ref, true);
      });
    } finally {
      options.signal?.removeEventListener("abort", abortContent);
      try { await content.close(); }
      finally {
        this.pendingActions.delete(pending);
        this.progressChanged(ref.sessionId);
      }
    }
  }
  private async invokeFromPlugin(sessionId: string, contract: ActionContract<unknown>, target: ResourceRef, input: Json,
    options: ResourceActionOptions & { owner: string; check(): void }): Promise<void> {
    options.check(); options.signal?.throwIfAborted();
    this.requireRef(sessionId, target);
    if (!this.resources.controller(target.kind)?.actionContracts?.includes(contract))
      throw new PluginApiError("invalid_argument", "Use the registered action contract instance for this resource.");
    const value = jsonSchema.parse(input);
    const lease = this.content.scope({ kind: "resource", sessionId, objectId: target.id, resourceKind: target.kind, contractId: contract.id });
    try {
      this.content.retain(lease, value, options.content, options.owner);
      await this.invokeResource(target, { id: contract.id, input: value }, lease, options);
    } finally { await lease.close(); }
  }
  private async prepareCommand(kind: string, raw: ResourceCall, context: { sessionId: string; objectId: string; content?: ContentLease }, request?: AbortSignal): Promise<ParsedCall> {
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(new Error("Action preparation timed out.")), 10_000);
    const signal = request ? AbortSignal.any([request, deadline.signal]) : deadline.signal;
    try { return await this.prepare(kind, raw, { ...context, signal }); }
    catch (error) {
      if (error instanceof PluginApiError) throw sessionPluginError(error);
      throw new SessionError("unavailable", "A plugin could not prepare this command.");
    }
    finally { clearTimeout(timeout); }
  }
  private object(sessionId: string, objectId: string): FoldedObject {
    const object = this.tree.workbench(sessionId).objects.find(o => o.id === objectId);
    if (!object) throw new SessionError("not_found", "Object not found on the current session path.");
    return object;
  }
  private requireRef(sessionId: string, ref: ResourceRef, finishingAction = false): FoldedObject {
    if (this.closed && !finishingAction) throw new SessionError("unavailable", "The session service is closed.");
    if (ref.sessionId !== sessionId) throw new SessionError("invalid_request", "The resource belongs to another session.");
    const object = this.object(sessionId, ref.id);
    if (object.kind !== ref.kind) throw new SessionError("invalid_request", "The resource type does not match its reference.");
    return object;
  }
  /** Frontend and plugins share identity, finalization, and transaction checks. */
  private setLink(sessionId: string, receiver: ResourceRef, resource: ResourceRef, linked: boolean): void {
    this.commit(sessionId, () => {
      this.requireRef(sessionId, receiver); this.requireRef(sessionId, resource);
      this.workbench.mutate({ type: "link.set", sessionId, receiverId: receiver.id, resourceId: resource.id, linked });
    });
  }
  private removeResource(sessionId: string, ref: ResourceRef): void {
    this.commit(sessionId, () => {
      const target = this.requireRef(sessionId, ref);
      if ([...this.pendingActions.values()].some(item => item.sessionId === sessionId && item.id === target.id)
        || this.pluginActivity(sessionId).busy.includes(target.id)
        || this.resources.controllers().some(controller => controller.activity?.(sessionId).busy.includes(target.id)))
        throw new SessionError("conflict", "Wait for this resource to settle before removing it.");
      this.workbench.mutate({ type: "object.remove", sessionId, objectId: ref.id });
    });
  }
  private assignTitle(sessionId: string, text: string, source: Source, detail?: Presentation): void {
    const data = SessionTitleAssigned.schema.parse({ title: text.replace(/\s+/gu, " ").trim(), ...(detail ? { detail } : {}) });
    this.commit(sessionId, writer => {
      writer.append({ contract: SessionTitleAssigned.id, data, source, model: null, recipient: null });
      this.tree.setTitle(sessionId, data.title);
    });
  }

  private renameResource(sessionId: string, ref: ResourceRef, text: string): string {
    const parsed = resourceTitleSchema.safeParse(text);
    if (!parsed.success) throw new SessionError("invalid_request", "The resource title must contain non-whitespace text and be at most 160 characters.");
    const title = parsed.data.trim();
    this.commit(sessionId, () => {
      this.requireRef(sessionId, ref);
      this.workbench.mutate({ type: "object.rename", sessionId, objectId: ref.id, title });
    });
    return title;
  }
  private readonly pendingActions = new Map<symbol, ResourceRef>();
  private readonly pendingCreations = new Map<symbol, { sessionId: string; controller: AbortController; done: Promise<ResourceCreationResult> }>();
  private createResource(sessionId: string, kind: string, call: ResourceCall, content: ContentLease,
    options: { signal?: AbortSignal; position?: { x: number; y: number }; linkTo?: ResourceRef; resources?: readonly ResourceRef[]; check?(): void } = {}): Promise<ResourceCreationResult> {
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const key = Symbol();
    const abortContent = () => content.controller.abort();
    signal.addEventListener("abort", abortContent, { once: true });
    // Register first to prevent cursor movement during asynchronous preparation; successful commits always append to the current timeline.
    let resolve!: (ref: ResourceCreationResult) => void, reject!: (error: unknown) => void;
    const done = new Promise<ResourceCreationResult>((accept, fail) => { resolve = accept; reject = fail; });
    const pending = { sessionId, controller, done };
    this.pendingCreations.set(key, pending);
    this.progressChanged(sessionId);
    void (async () => {
      try {
        if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
        this.tree.cursor(sessionId);
        signal.throwIfAborted(); options.check?.();
        const backend = this.resources.controller(kind);
        if (!backend?.prepareCreate || !backend.create) throw new SessionError("invalid_request", "This resource type cannot be created.");
        const input = await backend.prepareCreate(call, signal, content);
        return this.commit(sessionId, () => {
          signal.throwIfAborted(); options.check?.();
          if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
          if (options.linkTo) this.requireRef(sessionId, options.linkTo);
          for (const resource of options.resources ?? []) this.requireRef(sessionId, resource);
          const id = this.workbench.create(sessionId, kind, input, options.position ?? this.workbench.placement(sessionId, kind, options.linkTo?.id), content);
          const ref = { sessionId, id, kind };
          if (options.linkTo) this.setLink(sessionId, options.linkTo, ref, true);
          for (const resource of options.resources ?? []) this.setLink(sessionId, ref, resource, true);
          return { ...ref, title: this.requireRef(sessionId, ref).title };
        });
      } finally {
        signal.removeEventListener("abort", abortContent);
        await content.close();
        this.pendingCreations.delete(key);
        this.progressChanged(sessionId);
      }
    })().then(resolve, reject);
    return done;
  }
  private async createFromPlugin(sessionId: string, contract: CreationContract<unknown>, input: Json,
    options: ResourceCreationOptions & { owner: string; check(): void }): Promise<ResourceCreationResult> {
    options.check();
    if (this.resources.controller(contract.resource.kind)?.creationContract !== contract)
      throw new PluginApiError("invalid_argument", "Use the registered creation contract instance.");
    const value = jsonSchema.parse(input);
    const lease = this.content.scope({ kind: "resource", sessionId, resourceKind: contract.resource.kind, contractId: contract.id });
    try {
      this.content.retain(lease, value, options.content, options.owner);
      return await this.createResource(sessionId, contract.resource.kind, { id: contract.id, input: value }, lease, options);
    } finally { await lease.close(); }
  }
  async execute(raw: unknown): Promise<SessionReply> {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid session command.");
    const command = parsed.data;
    switch (command.type) {
      case "template.source": return { kind: "template.source", objects: this.templates.source(command.sessionId) };
      case "template.save": return { kind: "template.saved", templateId: this.transaction(() =>
        this.templates.save(command.sessionId, command.title, command.objectIds)) };
      case "template.delete":
        this.transaction(() => this.templates.delete(command.templateId));
        return { kind: "template.deleted" };
      case "template.start": {
        const sessionId = randomUUID();
        this.commit(sessionId, () => this.templates.instantiate(command.templateId, sessionId), { workbench: true });
        return { kind: "accepted", sessionId };
      }
      case "read": return { kind: "view", data: this.current(command.sessionId) };
      case "watch": {
        const data = this.current(command.sessionId);
        this.watching.set(command.sessionId, data.progress);
        this.changed({ kind: "session.opened", sessionId: command.sessionId, data });
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "unwatch":
        this.watching.delete(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      case "select":
        if (!this.settled(command.sessionId)) throw new SessionError("conflict", "Wait for all captured resources to settle before moving through history.");
        this.commit(command.sessionId, () => this.tree.select(command.sessionId, command.nodeId), { workbench: true });
        return { kind: "accepted", sessionId: command.sessionId };
      case "disposal.warnings": {
        const ids = command.objectIds ? new Set(command.objectIds) : null;
        return { kind: "warnings", warnings: this.tree.workbench(command.sessionId).objects.flatMap(object => {
          const warning = !ids || ids.has(object.id) ? this.resources.disposalWarning(object) : null;
          return warning ? [{ objectId: object.id, title: object.title, warning }] : [];
        }) };
      }
      case "archive":
        await this.archive(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      case "restore":
        this.tree.restore(command.sessionId);
        this.restorePlugins(command.sessionId);
        return { kind: "accepted", sessionId: command.sessionId };
      case "rename":
        try { this.assignTitle(command.sessionId, command.title, null); }
        catch (error) {
          if (error instanceof PluginApiError) throw sessionPluginError(error);
          throw error;
        }
        return { kind: "accepted", sessionId: command.sessionId };
      case "resource.command": {
        const resource = this.object(command.sessionId, command.objectId);
        const controller = this.resources.controller(resource.kind);
        if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
        await this.invoke(command.sessionId, command.objectId, command.command, command.contentScopeId);
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "resource.create": {
        this.tree.cursor(command.sessionId);
        const abort = new AbortController();
        const requestKey = command.requestId ? `${command.sessionId}/${command.requestId}` : undefined;
        if (requestKey && this.creating.has(requestKey)) throw new SessionError("conflict", "This creation request is already running.");
        const content = this.content.fork(command.contentScopeId, { kind: "resource", sessionId: command.sessionId, resourceKind: command.kind, contractId: command.creation.id });
        if (requestKey) this.creating.set(requestKey, abort);
        try {
          await this.createResource(command.sessionId, command.kind, { ...command.creation, input: command.input }, content,
            { signal: abort.signal, position: command.position });
          return { kind: "accepted", sessionId: command.sessionId };
        } catch (error) {
          if (abort.signal.aborted) throw new SessionError("conflict", "The creation was cancelled.");
          throw error;
        } finally {
          if (requestKey) this.creating.delete(requestKey);
          await content.close();
        }
      }
      case "resource.create.cancel":
        this.creating.get(`${command.sessionId}/${command.requestId}`)?.abort();
        return { kind: "accepted", sessionId: command.sessionId };
      default: {
        if (command.type === "object.remove") {
          const target = this.object(command.sessionId, command.objectId);
          this.removeResource(command.sessionId, { sessionId: command.sessionId, id: target.id, kind: target.kind });
        } else if (command.type === "object.rename") {
          const target = this.object(command.sessionId, command.objectId);
          this.renameResource(command.sessionId, { sessionId: command.sessionId, id: target.id, kind: target.kind }, command.title);
        } else if (command.type === "link.set") {
          const receiver = this.object(command.sessionId, command.receiverId), resource = this.object(command.sessionId, command.resourceId);
          this.setLink(command.sessionId, { sessionId: command.sessionId, id: receiver.id, kind: receiver.kind },
            { sessionId: command.sessionId, id: resource.id, kind: resource.kind }, command.linked);
        } else this.commit(command.sessionId, () => this.workbench.mutate(command), { layout: true });
        return { kind: "accepted", sessionId: command.sessionId };
      }
    }
  }
  /** In-flight session assembly is deduplicated by the contributing plugin and retry key. */
  private starting = new Map<string, Promise<string>>();
  /** Creation request under preparation; cancellation aborts preparation only, without rolling back committed transactions. */
  private creating = new Map<string, AbortController>();
  /** Input binds only assembled contracts without creating objects early or granting access to other resources. */
  openContentInput(target: ContentTarget): ContentLease {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    if (target.kind === "call") return this.content.scope(this.calls.contentTarget(target.contractId));
    const controller = this.resources.controller(target.resourceKind);
    if (target.objectId) {
      if (!target.sessionId || this.object(target.sessionId, target.objectId).kind !== target.resourceKind
        || !controller?.actionContracts?.some(action => action.id === target.contractId))
        throw new SessionError("invalid_request", "The content input does not match this object action.");
    } else {
      if (controller?.creationContract?.id !== target.contractId) throw new SessionError("invalid_request", "Unknown content creation contract.");
      if (target.sessionId) this.tree.cursor(target.sessionId);
    }
    return this.content.scope(target);
  }
  /** Plugin-scoped retry keys recover committed sessions without repeating preparation or initialization. */
  private initializeSession(owner: string, key: string, prepare: Parameters<SessionHost["initialize"]>[2], options: Parameters<SessionHost["initialize"]>[3]): Promise<string> {
    if (!key.trim()) throw new PluginApiError("invalid_argument", "A session creation key is required.");
    const receipt = JSON.stringify([owner, key]);
    const pending = this.starting.get(receipt);
    if (pending) return pending;
    const run = this.initializeSessionOnce(owner, receipt, prepare, options).finally(() => this.starting.delete(receipt));
    this.starting.set(receipt, run);
    return run;
  }
  private async initializeSessionOnce(owner: string, key: string, prepare: Parameters<SessionHost["initialize"]>[2], options: Parameters<SessionHost["initialize"]>[3]): Promise<string> {
    const prior = this.db.prepare("SELECT session_id FROM session_submissions WHERE id = ?").get(key) as { session_id: string } | undefined;
    if (prior) return prior.session_id;
    const { signal } = options;
    signal.throwIfAborted();
    const sessionId = randomUUID();
    const prepared = new Map<PreparedCreation, { id: string; kind: string; input: Json; content: ContentLease }>();
    const holds: { close(): Promise<void> }[] = [];
    const initialContent = this.content.scope();
    let active = true;
    /** Each prepared input owns a content scope holding the references it carries from the caller's reader. */
    const stage = (resourceKind: string, contractId: string, value: Json) => {
      if (!active) throw new PluginApiError("unavailable", "Session preparation has ended.");
      signal.throwIfAborted();
      const input = jsonSchema.parse(value);
      const content = this.content.scope({ kind: "resource", resourceKind, contractId });
      holds.push(content);
      this.content.retain(content, input, options.content, owner);
      return { input, content };
    };
    try {
      const initialization = await prepare({ signal, prepare: async (contract, value) => {
        const controller = this.resources.controller(contract.resource.kind);
        if (controller?.creationContract !== contract || !controller.prepareCreate)
          throw new PluginApiError("invalid_argument", "Use the registered resource creation contract.");
        const { input, content } = stage(contract.resource.kind, contract.id, value);
        const parsed = await controller.prepareCreate({ id: contract.id, input }, signal, content);
        const token = {} as PreparedCreation;
        prepared.set(token, { id: createResourceId(), kind: contract.resource.kind, input: parsed, content });
        return token;
      }, prepareAction: async <I, O extends Json>(token: PreparedCreation, contract: ActionContract<I, O>, value: NoInfer<I> & Json): Promise<O> => {
        const resource = prepared.get(token);
        if (!resource || resource.kind !== contract.resource.kind
          || !this.resources.controller(resource.kind)?.actionContracts?.includes(contract))
          throw new PluginApiError("invalid_argument", "Use a registered action for this prepared resource.");
        const { input, content } = stage(resource.kind, contract.id, value);
        const parsed = await this.prepare(resource.kind, { id: contract.id, input }, { sessionId, objectId: resource.id, signal, content });
        return parsed.value as O;
      } });
      active = false;
      signal.throwIfAborted();
      if (this.closed) throw new PluginApiError("unavailable", "The session service is closed.");
      const title = resourceTitleSchema.parse(initialization.title).trim();
      this.commit(sessionId, () => {
        this.tree.create(title, sessionId);
        initialization.initialize(sessionId, token => {
          const value = prepared.get(token);
          if (!value) throw new PluginApiError("invalid_argument", "The resource was not prepared in this session creation attempt.");
          prepared.delete(token);
          const id = this.workbench.createWith(sessionId, value.kind, value.id, value.input, this.workbench.placement(sessionId, value.kind), value.content);
          return { sessionId, id, kind: value.kind, title: this.object(sessionId, id).title };
        }, initialContent);
        this.db.prepare("INSERT INTO session_submissions (id, session_id) VALUES (?, ?)").run(key, sessionId);
      }, { workbench: true });
      return sessionId;
    } finally {
      active = false;
      await Promise.all([...holds, initialContent].map(hold => hold.close()));
    }
  }
  /** Shared archival/exit cleanup: abort in-flight creations, end all session object scopes, then mark archive time. */
  private async archive(sessionId: string): Promise<void> {
    this.tree.cursor(sessionId);
    if (this.archiving.has(sessionId)) throw new SessionError("conflict", "This session is already being archived.");
    this.archiving.add(sessionId);
    try {
      for (const [key, controller] of this.creating) if (key.startsWith(`${sessionId}/`)) controller.abort();
      const creations = [...this.pendingCreations.values()].filter(pending => pending.sessionId === sessionId);
      for (const pending of creations) pending.controller.abort();
      await Promise.allSettled(creations.map(pending => pending.done));
      await this.releasePlugins(sessionId);
      this.tree.archive(sessionId);
      this.watching.delete(sessionId);
      this.updates.delete(sessionId);
    } finally { this.archiving.delete(sessionId); }
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const pending of this.pendingCreations.values()) pending.controller.abort();
    await this.closePlugins();
    await this.shared.close();
    await Promise.allSettled([...this.pendingCreations.values()].map(pending => pending.done));
    await Promise.allSettled([...this.starting.values()]);
    await this.content.close();
    this.writesClosed = true;
  }
}
