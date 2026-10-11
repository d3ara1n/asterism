import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { SessionError, SessionTree } from "../session/tree.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import { AgentCapabilities } from "../execution/capabilities.ts";
import { createModules } from "../modules/runtime.ts";
import { createModelServices } from "../plugins/models.ts";
import { Agent } from "../modules/agent/contract.ts";
import type { PluginSessions, PluginSessionWriter as SessionWriter } from "../plugins/contract.ts";
import type { PluginManifest } from "../plugins/loader.ts";
import type { PluginDefinition } from "../plugins/contract.ts";
import type { ResourceRegistry } from "../resources/registry.ts";
import { createResourceId } from "../resources/id.ts";
import { ResourceStateStore } from "../resources/state.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ModelSettings } from "../shared/model.ts";
import { sessionCommandSchema, sessionSnapshotSchema, type SessionChanged, type SessionCommand, type SessionSnapshot,
  type SessionProgress, type SessionReply, type ViewPosition, type SessionNode } from "../shared/session.ts";
import { sessionPath, snap } from "../shared/session-path.ts";
import { SessionWorkbench } from "./workbench.ts";

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
  private readonly closePlugins: () => Promise<void>;
  private readonly committed: (sessionId: string, nodes: SessionNode[]) => void;
  constructor(private readonly db: DatabaseSync, dataRoot: string, configuration: ConfigurationService,
    private readonly changed: (event: SessionChanged) => void = () => {}, adapterFactory?: (settings: ModelSettings) => ModelAdapter, external: readonly PluginDefinition[] = []) {
    this.tree = new SessionTree(db);
    const host: PluginSessions = {
      path: sessionId => this.tree.path(sessionId),
      nodes: sessionId => this.tree.nodes(sessionId),
      title: sessionId => this.tree.title(sessionId),
      proposeTitle: (sessionId, text, expected) => {
        const title = text.replace(/\s+/gu, " ").trim().slice(0, 160);
        if (!title || this.closed) return false;
        const applied = this.transaction(() => this.tree.rename(sessionId, title, expected));
        if (applied) this.notify(sessionId);
        return applied;
      },
      commit: (sessionId, work) => this.commit(sessionId, work),
      progressChanged: sessionId => this.progressChanged(sessionId),
      changed: sessionId => this.notify(sessionId),
      linked: (path, objectId) => {
        const folded = foldWorkbench(path);
        const ids = new Set(folded.links.filter(link => link.agentId === objectId).map(link => link.resourceId));
        return folded.objects.filter(object => ids.has(object.id));
      },
      capabilities: (linked, policy) => new AgentCapabilities(this.resources, this.tools, linked, policy),
      context: linked => this.resources.context(linked),
    };
    const kindOf = (objectId: string): string | null => {
      const row = db.prepare("SELECT session_id FROM resource_states WHERE object_id = ? LIMIT 1").get(objectId) as { session_id: string } | undefined;
      const sessionIds = row ? [row.session_id] : this.tree.list().map(session => session.id);
      for (const sessionId of sessionIds) {
        for (const node of this.tree.nodes(sessionId)) {
          if (node.kind !== "event" || node.type !== "resource_created") continue;
          const data = node.data as { id?: unknown; type?: unknown };
          if (data.id === objectId) return String(data.type);
        }
      }
      return null;
    };
    const modules = createModules({ extensionsDirectory: join(dataRoot, "extensions"), state: new ResourceStateStore(db), kindOf, vault: configuration.vault,
      sessions: host, ...createModelServices(configuration, adapterFactory) }, external);
    this.resources = modules.resources;
    this.tools = modules.tools;
    this.plugins = modules.manifest;
    this.closePlugins = modules.close;
    this.committed = modules.committed;
    this.workbench = new SessionWorkbench(db, this.tree, this.resources,
      (sessionId, agentId, resource) => this.linkTools(sessionId, agentId, resource));
  }
  get running(): boolean { return this.resources.controllers().some(c => this.tree.list().some(s => (c.activity?.(s.id).running ?? []).length > 0)); }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  /** 单一写入者的同步提交区间：取父节点、记录事件与更新游标不可交错。 */
  private commit<T>(sessionId: string, work: (writer: SessionWriter) => T): T {
    const head = this.tree.head(sessionId);
    const result = this.transaction(() => work({
      append: node => this.tree.append(sessionId, node).id,
      completeBlock: (blockId, completion) => this.tree.completeBlock(sessionId, blockId, completion),
      continuation: () => {
        const cursor = this.tree.cursor(sessionId);
        if (this.settled(sessionId) && cursor !== null && snap(this.tree.nodes(sessionId), cursor) !== cursor) {
          this.tree.select(sessionId, cursor, "continuation");
        }
        return this.tree.path(sessionId);
      },
    }));
    this.notify(sessionId);
    // 提交后派发：事务已结束，处理器不在写入事务内运行。
    if (!this.closed) { const nodes = this.tree.since(sessionId, head); this.committed(sessionId, nodes); }
    return result;
  }
  /** 会话 settled：没有任何资源在活动；回溯只在此时允许。 */
  private settled(sessionId: string): boolean {
    return this.resources.controllers().every(controller => (controller.activity?.(sessionId).running.length ?? 0) === 0);
  }
  private notify(sessionId: string): void {
    const revision = (this.revisions.get(sessionId) ?? 0) + 1;
    this.revisions.set(sessionId, revision);
    try { this.changed({ kind: "session.changed", sessionId, revision }); }
    catch { /* 查询可恢复遗漏的通知 */ }
  }
  private progress(sessionId: string): SessionProgress {
    const activity = this.resources.controllers().map(controller => controller.activity?.(sessionId) ?? { running: [], live: [] });
    return { revision: this.revisions.get(sessionId) ?? 0, version: this.progressVersions.get(sessionId) ?? 0,
      unsettledObjectIds: [...new Set(activity.flatMap(a => a.running))],
      runningAgentIds: this.resources.controller(agentKind)?.activity?.(sessionId).running ?? [],
      live: activity.flatMap(a => a.live) };
  }
  private progressChanged(sessionId: string): void {
    this.progressVersions.set(sessionId, (this.progressVersions.get(sessionId) ?? 0) + 1);
    try { this.changed({ kind: "session.progress", sessionId, progress: this.progress(sessionId) }); }
    catch { /* 重新读取会话恢复当前进度 */ }
  }
  private linkTools(sessionId: string, agentId: string, resource: FoldedObject) {
    return this.resources.controller(agentKind)?.linkTools?.(sessionId, agentId, resource) ?? [];
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
        await controller.execute({ sessionId: command.sessionId, resource }, command.command,
          () => { this.object(command.sessionId, command.objectId); });
        return { kind: "accepted", sessionId: command.sessionId };
      }
      case "resource.create": {
        this.tree.cursor(command.sessionId);
        const controller = this.resources.controller(command.kind);
        const input = controller?.prepareCreate ? await controller.prepareCreate(command.input) : command.input;
        this.commit(command.sessionId, () => this.workbench.create(command.sessionId, command.kind, input, command.position));
        return { kind: "accepted", sessionId: command.sessionId };
      }
      default: {
        if (command.type === "object.remove") {
          const target = this.object(command.sessionId, command.objectId);
          if (this.resources.controllers().some(controller => controller.activity?.(command.sessionId).running.includes(target.id))) {
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
    const input = await agents.prepareCreate!({ selection });
    const again = existing(); if (again) return again;
    const sessionId = randomUUID();
    const agentId = createResourceId();
    const before = () => {
      this.tree.create(command.text.slice(0, 72), sessionId);
      this.workbench.createWith(sessionId, agentKind, agentId, input, { x: 48, y: 48 });
      this.db.prepare("INSERT INTO session_submissions (id, command_json, session_id) VALUES (?, ?, ?)").run(command.submissionId, JSON.stringify(command), sessionId);
    };
    const resource: FoldedObject = { id: agentId, kind: agentKind, title: "", data: {} };
    await agents.execute!({ sessionId, resource }, { type: "submit", submissionId: command.submissionId, text: command.text }, before);
    return { kind: "accepted", sessionId };
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled(this.resources.controllers().map(controller => controller.close?.()));
    await this.closePlugins();
  }
}
