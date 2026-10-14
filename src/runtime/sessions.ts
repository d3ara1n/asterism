import { resourceCall, type ResourceCall, type Json, type ModelInputPart } from "@atelier/sdk/contracts";
import type { ResourceRef, PluginDefinition } from "@atelier/sdk/runtime";
import { PluginApiError } from "@atelier/sdk/runtime";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { ConfigurationService } from "../configuration/service.ts";
import { AgentCapabilities } from "../execution/capabilities.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { Agent, CreateAgent, SubmitAgentInput, startAgentContentTarget, type AgentCommand } from "../modules/agent/contract.ts";
import { createSelection } from "../modules/agent/selection.ts";
import { composeSystemPrompt } from "../modules/agent/system-prompt.ts";
import type { NamingApi } from "../modules/naming/runtime.ts";
import { inputReferences } from "../model/input.ts";
import { inputSummary } from "../shared/model-input.ts";
import { createModules } from "../modules/runtime.ts";
import type { ParsedCall } from "../plugins/commands.ts";
import { createCoreCatalogs } from "../plugins/core-catalogs.ts";
import type { SessionHost, SessionHostWriter as SessionWriter } from "../plugins/host.ts";
import type { PluginManifest, LoadedPlugins } from "../plugins/loader.ts";
import { createModelServices } from "../plugins/models.ts";
import { createResourceId } from "../resources/id.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import { SessionDataStore } from "../session/data.ts";
import type { FoldedObject } from "../session/fold.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import type { ModelSettings, AgentSelection } from "../shared/model.ts";
import type { ObjectStreamPayload } from "../shared/object-stream.ts";
import { sessionCommandSchema, sessionSnapshotSchema, type SessionChanged, type SessionCommand, type SessionSnapshot, type SessionProgress, type SessionReply, type SessionNode, type LiveBlock } from "../shared/session.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { sessionPluginError } from "./plugin-errors.ts";
import { SessionWorkbench } from "./workbench.ts";
import { ContentStore, type ContentLease, type ContentTarget } from "./content-store.ts";
import { applicationStorage } from "../shared/application.ts";
import { EventBus } from "../plugins/events.ts";
import { ResourceStatusChanged, SessionTitleChanged } from "@atelier/sdk/contracts";

const agentKind = Agent.kind;
const startIdentity = ({ contentScopeId: _scope, ...input }: Extract<SessionCommand, { type: "start" }>) => JSON.stringify(input);

/**
 * 会话应用入口：组合内置领域接口，并提供会话树、工作台事件、布局和通知机制。
 * 资源行为（含代理的提交、运行、配置）由各资源控制器负责，会话按对象类型路由命令。
 */
export class SessionService {
  readonly events = new EventBus();
  private revisions = new Map<string, number>();
  private progressVersions = new Map<string, number>();
  private closed = false;
  readonly tree: SessionTree;
  readonly content: ContentStore;
  private readonly workbench: SessionWorkbench;
  private readonly resources: ResourceRegistry;
  private readonly tools: ToolRegistry;
  readonly plugins: readonly PluginManifest[];
  readonly configurePlugins: LoadedPlugins["configure"];
  private readonly closePlugins: () => Promise<void>;
  private readonly naming: NamingApi;
  private readonly prepare: LoadedPlugins["prepare"];
  private readonly afterCommit: LoadedPlugins["afterCommit"];
  private readonly modelActivity: (sessionId: string) => { running: string[]; live: LiveBlock[] };
  private readonly validateInitialInput: (selection: AgentSelection, parts: ModelInputPart[], content: ContentLease) => Promise<void>;
  constructor(private readonly db: DatabaseSync, dataRoot: string, configuration: ConfigurationService,
    private readonly changed: (event: SessionChanged) => void = () => {}, adapterFactory?: (settings: ModelSettings) => ModelAdapter, external: readonly PluginDefinition[] = [],
    stream?: (event: ObjectStreamPayload) => void, configurationChanged?: (pluginId: string) => void) {
    this.tree = new SessionTree(db);
    this.events.declarePublic(SessionTitleChanged);
    this.events.declarePublic(ResourceStatusChanged);
    this.content = new ContentStore(db, join(dataRoot, applicationStorage.contentDirectory));
    const host: SessionHost = {
      view: sessionId => this.tree.view(sessionId),
      sequences: (sessionId, nodes) => this.tree.sequences(sessionId, nodes),
      timeline: sessionId => this.tree.timeline(sessionId),
      workbench: sessionId => this.tree.workbench(sessionId),
      title: sessionId => this.tree.title(sessionId),
      setTitle: (sessionId, text) => {
        const title = text.replace(/\s+/gu, " ").trim().slice(0, 160);
        // 空标题无意义，直接忽略；在提交内随外层事务生效，否则作为一次独立提交。
        if (!title || this.closed || title === this.tree.title(sessionId)) return;
        this.commit(sessionId, () => this.tree.setTitle(sessionId, title));
      },
      commit: (sessionId, work) => this.commit(sessionId, work),
      idle: (sessionId, objectId) => this.modelActivity(sessionId).running.length === 0
        && !this.resources.controllers().some(controller => controller.activity?.(sessionId).running.some(id => id !== objectId)),
      progressChanged: sessionId => this.progressChanged(sessionId),
      linked: (sessionId, objectId) => {
        const folded = this.tree.workbench(sessionId);
        const ids = new Set(folded.links.filter(link => link.agentId === objectId).map(link => link.resourceId));
        return folded.objects.filter(object => ids.has(object.id));
      },
      capabilities: (linked, policy) => new AgentCapabilities(this.resources, this.tools, linked, policy),
      context: linked => this.resources.context(linked),
    };
    const refOf = (objectId: string): ResourceRef | null => {
      const sessionIds = this.tree.list().map(session => session.id);
      for (const sessionId of sessionIds) {
        for (const node of this.tree.nodes(sessionId)) {
          if (node.contract !== "resource_created") continue;
          const data = node.data as { id?: unknown; type?: unknown };
          if (data.id === objectId) return { sessionId, id: objectId, kind: String(data.type) };
        }
      }
      return null;
    };
    const models = createModelServices(configuration, adapterFactory);
    const selection = createSelection({ agents: () => configuration.current().agents });
    // 首条 submit 准备时对象尚未创建；组合入口用已经准备好的选择执行同一模型预检。
    this.validateInitialInput = async (value, parts, content) => {
      try {
        await models.validate({ target: selection.target(value), system: composeSystemPrompt(selection.agent(value)),
          messages: [{ kind: "input", parts }], signal: AbortSignal.timeout(10_000) },
        { content: messages => this.content.capture(inputReferences(messages), { scope: content }) });
      } catch (error) {
        if (error instanceof PluginApiError) throw sessionPluginError(error);
        throw error;
      }
    };
    const modules = createModules({ events: this.events, extensionsDirectory: join(dataRoot, "extensions"), data: new SessionDataStore(db), content: this.content, refOf, vault: configuration.vault, stream, configurationChanged,
      sessions: host, models, catalogs: createCoreCatalogs(configuration) }, external);
    this.resources = modules.resources;
    this.tools = modules.tools;
    this.plugins = modules.manifest;
    this.configurePlugins = modules.configure;
    this.closePlugins = modules.close;
    this.naming = modules.naming;
    this.afterCommit = modules.afterCommit;
    this.prepare = modules.prepare;
    this.modelActivity = modules.activity;
    this.workbench = new SessionWorkbench(db, this.tree, this.resources,
      (sessionId, agentId, resource) => this.linkTools(sessionId, agentId, resource), this.content);
  }
  get running(): boolean { return this.tree.list().some(session => !this.settled(session.id)); }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  /** 单一写入者的同步提交区间：取父节点、记录事件与更新游标不可交错。 */
  private committing: { sessionId: string; writer: SessionWriter } | null = null;
  private writesClosed = false;
  private commit<T>(sessionId: string, work: (writer: SessionWriter) => T): T {
    if (this.writesClosed) throw new SessionError("unavailable", "The session service is closed.");
    if (this.committing) {
      if (this.committing.sessionId !== sessionId) throw new SessionError("conflict", "A commit cannot write another session.");
      this.db.exec("SAVEPOINT nested_session_commit");
      try {
        const result = work(this.committing.writer);
        this.db.exec("RELEASE nested_session_commit");
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
    const result = this.transaction(() => {
      this.committing = { sessionId, writer };
      try {
        const result = work(writer);
        // 存在性与链接参与执行校验，必须在提交成功和派发观察者之前重建。
        this.tree.workbench(sessionId);
        return result;
      }
      finally { this.committing = null; }
    });
    // 标题以最外层提交成功后的实际值为准；回滚的提交不会走到这里。
    const title = this.tree.titleOf(sessionId);
    if (!this.closed && title !== null && title !== titleBefore) this.events.publish(SessionTitleChanged, null, { sessionId, title });
    // 提交后交给插件派发队列；观察者内的提交排队，队列清空后每个会话通知界面一次。
    const change = { records: this.tree.since(sessionId, head), cursorChanged: before !== this.tree.position(sessionId) };
    if (this.closed) this.notify(sessionId);
    else this.afterCommit(sessionId, change, id => this.notify(id));
    return result;
  }
  /** 会话 settled：没有任何资源在活动；回溯只在此时允许。 */
  private settled(sessionId: string): boolean {
    return this.modelActivity(sessionId).running.length === 0
      && this.resources.controllers().every(controller => (controller.activity?.(sessionId).running.length ?? 0) === 0);
  }
  private notify(sessionId: string): void {
    const revision = (this.revisions.get(sessionId) ?? 0) + 1;
    this.revisions.set(sessionId, revision);
    try { this.changed({ kind: "session.changed", sessionId, revision }); }
    catch { /* 查询可恢复遗漏的通知 */ }
  }
  private progress(sessionId: string): SessionProgress {
    const activity = [...this.resources.controllers().map(controller => controller.activity?.(sessionId) ?? { running: [], live: [] }), this.modelActivity(sessionId)];
    return { revision: this.revisions.get(sessionId) ?? 0, version: this.progressVersions.get(sessionId) ?? 0,
      unsettledObjectIds: [...new Set(activity.flatMap(a => a.running))],
      live: activity.flatMap(a => a.live) };
  }
  private progressChanged(sessionId: string): void {
    this.progressVersions.set(sessionId, (this.progressVersions.get(sessionId) ?? 0) + 1);
    try { this.changed({ kind: "session.progress", sessionId, progress: this.progress(sessionId) }); }
    catch { /* 重新读取会话恢复当前进度 */ }
  }
  private linkTools(sessionId: string, agentId: string, resource: FoldedObject) {
    const recipient = this.object(sessionId, agentId);
    return this.resources.controller(recipient.kind)?.linkTools?.(sessionId, agentId, resource) ?? [];
  }
  snapshot(sessionId: string): SessionSnapshot {
    const nodes = this.tree.nodes(sessionId);
    const cursor = this.tree.cursor(sessionId);
    const title = this.tree.title(sessionId);
    return sessionSnapshotSchema.parse({ sessionId, title, cursor, seq: this.tree.head(sessionId),
      revision: this.revisions.get(sessionId) ?? 0, nodes, progress: this.progress(sessionId),
      workbench: this.workbench.project(sessionId, title) });
  }
  /** 资源命令入口：事务外准备，执行时 before 在提交事务内重验对象仍在当前路径上。 */
  private async invoke(sessionId: string, objectId: string, raw: ResourceCall, inputScopeId?: string): Promise<void> {
    const resource = this.object(sessionId, objectId);
    const controller = this.resources.controller(resource.kind);
    if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
    const content = this.content.fork(inputScopeId, { sessionId, objectId, resourceKind: resource.kind, contractId: raw.id });
    try {
      const command = await this.prepareCommand(resource.kind, raw, { sessionId, objectId, content });
      await controller.execute({ sessionId, resource }, command, () => { this.object(sessionId, objectId); });
    } finally { await content.close(); }
  }
  private async prepareCommand(kind: string, raw: ResourceCall, context: { sessionId: string; objectId: string; content?: ContentLease }): Promise<ParsedCall> {
    try { return await this.prepare(kind, raw, { ...context, signal: AbortSignal.timeout(10_000) }); }
    catch (error) {
      if (error instanceof PluginApiError) throw sessionPluginError(error);
      throw new SessionError("unavailable", "A plugin could not prepare this command.");
    }
  }
  private object(sessionId: string, objectId: string): FoldedObject {
    const object = this.tree.workbench(sessionId).objects.find(o => o.id === objectId);
    if (!object) throw new SessionError("not_found", "Object not found on the current session path.");
    return object;
  }
  async execute(raw: SessionCommand): Promise<SessionReply> {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid session command.");
    const command = parsed.data;
    switch (command.type) {
      case "read": return { kind: "view", snapshot: this.snapshot(command.sessionId) };
      case "select":
        if (!this.settled(command.sessionId)) throw new SessionError("conflict", "Wait for all captured resources to settle before moving through history.");
        this.commit(command.sessionId, () => this.tree.select(command.sessionId, command.nodeId));
        return { kind: "accepted", sessionId: command.sessionId };
      case "start": return this.start(command);
      case "rename":
        try { this.naming.nameByUser(command.sessionId, command.title); }
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
        const controller = this.resources.controller(command.kind);
        const abort = new AbortController();
        const requestKey = command.requestId ? `${command.sessionId}/${command.requestId}` : undefined;
        if (requestKey && this.creating.has(requestKey)) throw new SessionError("conflict", "This creation request is already running.");
        const content = this.content.fork(command.contentScopeId, { sessionId: command.sessionId, resourceKind: command.kind, contractId: command.creation.id });
        if (requestKey) this.creating.set(requestKey, abort);
        const cancelContent = () => content.controller.abort();
        abort.signal.addEventListener("abort", cancelContent, { once: true });
        try {
          const input = controller?.prepareCreate ? await controller.prepareCreate({ ...command.creation, input: command.input }, abort.signal, content) : command.input;
          if (abort.signal.aborted) throw new SessionError("conflict", "The creation was cancelled.");
          this.commit(command.sessionId, () => this.workbench.create(command.sessionId, command.kind, input, command.position, content));
          return { kind: "accepted", sessionId: command.sessionId };
        } catch (error) {
          if (abort.signal.aborted) throw new SessionError("conflict", "The creation was cancelled.");
          throw error;
        } finally {
          abort.signal.removeEventListener("abort", cancelContent);
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
          if (this.modelActivity(command.sessionId).running.includes(target.id)
            || this.resources.controllers().some(controller => controller.activity?.(command.sessionId).running.includes(target.id))) {
            throw new SessionError("conflict", "Wait for this resource to settle before removing it.");
          }
        }
        this.commit(command.sessionId, () => this.workbench.mutate(command));
        return { kind: "accepted", sessionId: command.sessionId };
      }
    }
  }
  /** 首页组合入口：建立会话、创建第一个代理资源，并以代理自己的 submit 发送首条输入，整体原子提交。 */
  private starting = new Map<string, Promise<SessionReply>>();
  /** 准备中的创建请求；取消只中止准备，不回滚已提交的事务。 */
  private creating = new Map<string, AbortController>();
  /** 输入只绑定已装配契约；不提前创建对象或授予其他资源访问。 */
  openContentInput(target: ContentTarget): ContentLease {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    if (target.contractId === startAgentContentTarget.contractId) {
      if (target.resourceKind !== agentKind || target.sessionId !== undefined || target.objectId !== undefined)
        throw new SessionError("invalid_request", "The content input does not match a new conversation.");
      return this.content.scope(target);
    }
    const controller = this.resources.controller(target.resourceKind);
    if (target.objectId) {
      if (!target.sessionId || this.object(target.sessionId, target.objectId).kind !== target.resourceKind
        || !controller?.actionIds?.includes(target.contractId))
        throw new SessionError("invalid_request", "The content input does not match this object action.");
    } else {
      if (controller?.creationId !== target.contractId) throw new SessionError("invalid_request", "Unknown content creation contract.");
      if (target.sessionId) this.tree.cursor(target.sessionId);
    }
    return this.content.scope(target);
  }
  /** 同一提交身份的并发首页发送共享一次执行。 */
  private start(command: Extract<SessionCommand, { type: "start" }>): Promise<SessionReply> {
    const pending = this.starting.get(command.submissionId);
    if (pending) return pending.then(reply => {
      if (this.db.prepare("SELECT command_json FROM session_submissions WHERE id = ?").get(command.submissionId) &&
        (this.db.prepare("SELECT command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { command_json: string }).command_json !== startIdentity(command))
        throw new SessionError("conflict", "This submission ID was already used for different input.");
      return reply;
    });
    const run = this.startOnce(command).finally(() => this.starting.delete(command.submissionId));
    this.starting.set(command.submissionId, run);
    return run;
  }
  /** 唯一领域例外：首页发起指名内置 agent，经正规创建与动作接口建立代理并提交首条输入。 */
  private async startOnce(command: Extract<SessionCommand, { type: "start" }>): Promise<SessionReply> {
    const existing = () => {
      const row = this.db.prepare("SELECT session_id, command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { session_id: string; command_json: string } | undefined;
      if (!row) return null;
      if (row.command_json !== startIdentity(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
      return { kind: "accepted" as const, sessionId: row.session_id };
    };
    const prior = existing(); if (prior) return prior;
    const content = this.content.fork(command.contentScopeId, startAgentContentTarget);
    try {
      const agents = this.resources.controller(agentKind)!;
      const selection = { agent: command.agent, model: command.model, thinking: command.thinking };
      const input = await agents.prepareCreate!(resourceCall(CreateAgent, { selection }));
      const again = existing(); if (again) return again;
      const sessionId = randomUUID();
      const agentId = createResourceId();
      const before = () => {
        this.tree.create(inputSummary(command.parts).slice(0, 72), sessionId);
        this.workbench.createWith(sessionId, agentKind, agentId, input, { x: 48, y: 48 });
        this.db.prepare("INSERT INTO session_submissions (id, command_json, session_id) VALUES (?, ?, ?)").run(command.submissionId, startIdentity(command), sessionId);
      };
      const resource: FoldedObject = { id: agentId, kind: agentKind, title: "", data: {} };
      // 首页首条输入同样经准备流水线；此时代理尚未创建，objectId 为将要创建的身份。
      const submit = await this.prepareCommand(agentKind, resourceCall(SubmitAgentInput, { type: "submit", submissionId: command.submissionId, parts: command.parts }), { sessionId, objectId: agentId, content });
      await this.validateInitialInput((input as { selection: AgentSelection }).selection,
        (submit.value as Extract<AgentCommand, { type: "submit" }>).parts, content);
      await agents.execute!({ sessionId, resource }, submit, before);
      return { kind: "accepted", sessionId };
    } finally { await content.close(); }
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.closePlugins();
    await Promise.allSettled([...this.starting.values()]);
    await this.content.close();
    this.writesClosed = true;
  }
}
