import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import { AgentCapabilities } from "../execution/capabilities.ts";
import { createModules } from "../modules/runtime.ts";
import { createCoreCatalogs } from "../plugins/core-catalogs.ts";
import { createModelServices } from "../plugins/models.ts";
import { Agent, CreateAgent, SubmitAgentInput } from "../modules/agent/contract.ts";
import type { SessionHost, SessionHostWriter as SessionWriter } from "../plugins/host.ts";
import type { PluginManifest } from "../plugins/loader.ts";
import type { ResourceRef, PluginDefinition } from "@atelier/sdk/runtime";
import type { ResourceRegistry } from "../resources/registry.ts";
import { createResourceId } from "../resources/id.ts";
import { SessionDataStore } from "../session/data.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ModelSettings } from "../shared/model.ts";
import { sessionCommandSchema, sessionSnapshotSchema, type SessionChanged, type SessionCommand, type SessionSnapshot,
  type SessionProgress, type SessionReply, type ViewPosition, type SessionNode, type LiveBlock } from "../shared/session.ts";
import { sessionPath, snap } from "../shared/session-path.ts";
import { SessionWorkbench } from "./workbench.ts";
import { PluginApiError } from "@atelier/sdk/runtime";
import { resourceCall, type ResourceCall, type Json } from "@atelier/sdk/contracts";
import type { LoadedPlugins } from "../plugins/loader.ts";
import type { ParsedCall } from "../plugins/commands.ts";
import type { ObjectStreamPayload } from "../shared/object-stream.ts";

const agentKind = Agent.kind;

/**
 * 会话入口：只拥有会话树、工作台对象与连线事件、布局和通知。
 * 资源行为（含代理的提交、运行、配置）由各资源控制器负责，会话按对象类型路由命令。
 */
export class SessionService {
  private revisions = new Map<string, number>();
  private progressVersions = new Map<string, number>();
  private closed = false;
  readonly tree: SessionTree;
  private readonly workbench: SessionWorkbench;
  private readonly resources: ResourceRegistry;
  private readonly tools: ToolRegistry;
  readonly plugins: readonly PluginManifest[];
  readonly configurePlugins: LoadedPlugins["configure"];
  private readonly closePlugins: () => Promise<void>;
  private readonly prepare: LoadedPlugins["prepare"];
  private readonly committed: (sessionId: string, nodes: SessionNode[]) => void;
  private readonly modelActivity: (sessionId: string) => { running: string[]; live: LiveBlock[] };
  constructor(private readonly db: DatabaseSync, dataRoot: string, configuration: ConfigurationService,
    private readonly changed: (event: SessionChanged) => void = () => {}, adapterFactory?: (settings: ModelSettings) => ModelAdapter, external: readonly PluginDefinition[] = [],
    stream?: (event: ObjectStreamPayload) => void) {
    this.tree = new SessionTree(db);
    const host: SessionHost = {
      path: sessionId => this.tree.path(sessionId),
      nodes: sessionId => this.tree.nodes(sessionId),
      title: sessionId => this.tree.title(sessionId),
      proposeTitle: (sessionId, text, expected) => {
        const title = text.replace(/\s+/gu, " ").trim().slice(0, 160);
        if (!title || this.closed) return false;
        // 插件可在同步提交内同时应用标题与追加来源事件，失败时由外层事务一起回滚。
        if (this.committing) {
          if (this.committing.sessionId !== sessionId) throw new SessionError("conflict", "A commit cannot rename another session.");
          return this.tree.rename(sessionId, title, expected);
        }
        const applied = this.transaction(() => this.tree.rename(sessionId, title, expected));
        if (applied) this.notify(sessionId);
        return applied;
      },
      commit: (sessionId, work) => this.commit(sessionId, work),
      resume: (sessionId, objectId) => {
        if (!host.canResume(sessionId, objectId)) return;
        this.commit(sessionId, () => {
          const cursor = this.tree.cursor(sessionId);
          if (cursor !== null && snap(this.tree.nodes(sessionId), cursor) !== cursor) this.tree.select(sessionId, cursor, "continuation");
        });
      },
      canResume: (sessionId, objectId) => this.modelActivity(sessionId).running.length === 0
        && !this.resources.controllers().some(controller => controller.activity?.(sessionId).running.some(id => id !== objectId)),
      progressChanged: sessionId => this.progressChanged(sessionId),
      linked: (path, objectId) => {
        const folded = foldWorkbench(path);
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
          if (node.kind !== "event" || node.type !== "resource_created") continue;
          const data = node.data as { id?: unknown; type?: unknown };
          if (data.id === objectId) return { sessionId, id: objectId, kind: String(data.type) };
        }
      }
      return null;
    };
    const modules = createModules({ extensionsDirectory: join(dataRoot, "extensions"), data: new SessionDataStore(db), refOf, vault: configuration.vault, stream,
      sessions: host, models: createModelServices(configuration, adapterFactory), catalogs: createCoreCatalogs(configuration) }, external);
    this.resources = modules.resources;
    this.tools = modules.tools;
    this.plugins = modules.manifest;
    this.configurePlugins = modules.configure;
    this.closePlugins = modules.close;
    this.committed = modules.committed;
    this.prepare = modules.prepare;
    this.modelActivity = modules.activity;
    this.workbench = new SessionWorkbench(db, this.tree, this.resources,
      (sessionId, agentId, resource) => this.linkTools(sessionId, agentId, resource));
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
    const head = this.tree.head(sessionId);
    const writer: SessionWriter = {
      append: node => this.tree.append(sessionId, node).id,
      nodes: () => this.tree.nodes(sessionId),
      completeBlock: (blockId, completion) => this.tree.completeBlock(sessionId, blockId, completion),
    };
    const result = this.transaction(() => {
      this.committing = { sessionId, writer };
      try { return work(writer); }
      finally { this.committing = null; }
    });
    this.notify(sessionId);
    // 提交后派发：事务已结束，处理器不在写入事务内运行。
    if (!this.closed) { const nodes = this.tree.since(sessionId, head); this.committed(sessionId, nodes); }
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
      runningAgentIds: [...new Set(activity.flatMap(value => value.running))].filter(id =>
        this.tree.nodes(sessionId).some(node => node.kind === "event" && node.type === "resource_created"
          && node.data !== null && typeof node.data === "object" && !Array.isArray(node.data)
          && node.data.id === id && node.data.type === agentKind)),
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
  snapshot(sessionId: string, position: ViewPosition = { kind: "live" }): SessionSnapshot {
    const nodes = this.tree.nodes(sessionId);
    const cursor = this.tree.cursor(sessionId);
    const at = position.kind === "live" ? cursor : position.nodeId;
    const path = sessionPath(nodes, at);
    const title = this.tree.title(sessionId);
    return sessionSnapshotSchema.parse({ sessionId, title, cursor, at, seq: this.tree.head(sessionId),
      revision: this.revisions.get(sessionId) ?? 0, nodes, progress: this.progress(sessionId),
      workbench: this.workbench.project(sessionId, title, path) });
  }
  /** 资源命令入口：事务外准备，执行时 before 在提交事务内重验对象仍在当前路径上。 */
  private async invoke(sessionId: string, objectId: string, raw: ResourceCall): Promise<void> {
    const resource = this.object(sessionId, objectId);
    const controller = this.resources.controller(resource.kind);
    if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
    const command = await this.prepareCommand(resource.kind, raw, { sessionId, objectId });
    await controller.execute({ sessionId, resource }, command, () => { this.object(sessionId, objectId); });
  }
  private async prepareCommand(kind: string, raw: ResourceCall, context: { sessionId: string; objectId: string }): Promise<ParsedCall> {
    try { return await this.prepare(kind, raw, { ...context, signal: AbortSignal.timeout(10_000) }); }
    catch (error) {
      if (error instanceof PluginApiError) throw new SessionError(
        error.code === "invalid_argument" || error.code === "rejected" ? "invalid_request"
          : error.code === "conflict" || error.code === "not_found" ? error.code : "unavailable", error.message);
      throw new SessionError("unavailable", "A plugin could not prepare this command.");
    }
  }
  private object(sessionId: string, objectId: string): FoldedObject {
    const object = foldWorkbench(this.tree.path(sessionId)).objects.find(o => o.id === objectId);
    if (!object) throw new SessionError("not_found", "Object not found on the current session path.");
    return object;
  }
  async execute(raw: SessionCommand): Promise<SessionReply> {
    if (this.closed) throw new SessionError("unavailable", "The session service is closed.");
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) throw new SessionError("invalid_request", "Invalid session command.");
    const command = parsed.data;
    switch (command.type) {
      case "read": return { kind: "view", snapshot: this.snapshot(command.sessionId, command.position) };
      case "select":
        if (!this.settled(command.sessionId)) throw new SessionError("conflict", "Wait for all captured resources to settle before moving through history.");
        this.commit(command.sessionId, () => this.tree.select(command.sessionId, command.nodeId));
        return { kind: "accepted", sessionId: command.sessionId };
      case "start": return this.start(command);
      case "resource.command": {
        const resource = this.object(command.sessionId, command.objectId);
        const controller = this.resources.controller(resource.kind);
        if (!controller?.execute) throw new SessionError("invalid_request", "This resource has no actions.");
        await this.invoke(command.sessionId, command.objectId, command.command);
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "resource.create": {
        this.tree.cursor(command.sessionId);
        const controller = this.resources.controller(command.kind);
        const abort = new AbortController();
        if (command.requestId) {
          if (this.creating.has(command.requestId)) throw new SessionError("conflict", "This creation request is already running.");
          this.creating.set(command.requestId, abort);
        }
        let input: Json;
        try {
          input = controller?.prepareCreate ? await controller.prepareCreate({ ...command.creation, input: command.input }, abort.signal) : command.input;
        } catch (error) {
          if (abort.signal.aborted) throw new SessionError("conflict", "The creation was cancelled.");
          throw error;
        } finally { if (command.requestId) this.creating.delete(command.requestId); }
        if (abort.signal.aborted) throw new SessionError("conflict", "The creation was cancelled.");
        this.commit(command.sessionId, () => this.workbench.create(command.sessionId, command.kind, input, command.position));
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "resource.create.cancel":
        this.creating.get(command.requestId)?.abort();
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
  /** 同一提交身份的并发首页发送共享一次执行。 */
  private start(command: Extract<SessionCommand, { type: "start" }>): Promise<SessionReply> {
    const pending = this.starting.get(command.submissionId);
    if (pending) return pending.then(reply => {
      if (this.db.prepare("SELECT command_json FROM session_submissions WHERE id = ?").get(command.submissionId) &&
        (this.db.prepare("SELECT command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { command_json: string }).command_json !== JSON.stringify(command))
        throw new SessionError("conflict", "This submission ID was already used for different input.");
      return reply;
    });
    const run = this.startOnce(command).finally(() => this.starting.delete(command.submissionId));
    this.starting.set(command.submissionId, run);
    return run;
  }
  private async startOnce(command: Extract<SessionCommand, { type: "start" }>): Promise<SessionReply> {
    const existing = () => {
      const row = this.db.prepare("SELECT session_id, command_json FROM session_submissions WHERE id = ?").get(command.submissionId) as { session_id: string; command_json: string } | undefined;
      if (!row) return null;
      if (row.command_json !== JSON.stringify(command)) throw new SessionError("conflict", "This submission ID was already used for different input.");
      return { kind: "accepted" as const, sessionId: row.session_id };
    };
    const prior = existing(); if (prior) return prior;
    const agents = this.resources.controller(agentKind)!;
    const selection = { agent: command.agent, model: command.model, thinking: command.thinking };
    const input = await agents.prepareCreate!(resourceCall(CreateAgent, { selection }));
    const again = existing(); if (again) return again;
    const sessionId = randomUUID();
    const agentId = createResourceId();
    const before = () => {
      this.tree.create(command.text.slice(0, 72), sessionId);
      this.workbench.createWith(sessionId, agentKind, agentId, input, { x: 48, y: 48 });
      this.db.prepare("INSERT INTO session_submissions (id, command_json, session_id) VALUES (?, ?, ?)").run(command.submissionId, JSON.stringify(command), sessionId);
    };
    const resource: FoldedObject = { id: agentId, kind: agentKind, title: "", data: {} };
    // 首页首条输入同样经准备流水线；此时代理尚未创建，objectId 为将要创建的身份。
    const submit = await this.prepareCommand(agentKind, resourceCall(SubmitAgentInput, { type: "submit", submissionId: command.submissionId, text: command.text }), { sessionId, objectId: agentId });
    await agents.execute!({ sessionId, resource }, submit, before);
    return { kind: "accepted", sessionId };
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.closePlugins();
    this.writesClosed = true;
  }
}
