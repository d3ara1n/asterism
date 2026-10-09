import { basename, isAbsolute, join } from "node:path";
import { directoryType, noteType, toolSummary } from "../resources/index.ts";
import type { DatabaseSync } from "node:sqlite";
import { commandSchema, snapshotSchema, type Command, type AppSnapshot, type AppError, type Point, type Viewport, type WorkbenchObject } from "../shared/contracts.ts";
import { ObjectStore, openDatabase } from "./storage.ts";
import { ConfigurationService } from "../configuration/service.ts";
import type { SecretProtector } from "../shared/secrets.ts";
import { SessionService } from "./sessions.ts";
import type { SessionChanged } from "../shared/session.ts";
import type { ModelSettings } from "../shared/model.ts";
import type { ModelAdapter } from "../model/contract.ts";
import { foldWorkbench } from "../session/fold.ts";
import { SessionError } from "../session/tree.ts";

const toolNames = (kind: string) => kind === "directory" ? directoryType.tools.map(t => t.name) : ["read"];

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string) { super(message); }
}
type ViewRow = { object_id: string; x: number; y: number; hidden: number; collapsed: number };

/** 工作台命令入口：对象与链接作为会话树事件节点追加，布局是独立视图状态。 */
export class ApplicationService {
  readonly configuration: ConfigurationService;
  readonly sessions: SessionService;
  private readonly db: DatabaseSync;
  private readonly objects: ObjectStore;
  constructor(root: string, options: { protector?: SecretProtector; onConfigurationChanged?: () => void; onSessionChanged?: (event: SessionChanged) => void; adapterFactory?: (settings: ModelSettings) => ModelAdapter } = {}) {
    this.db = openDatabase(root);
    try {
      this.objects = new ObjectStore(join(root, "objects"));
      const unavailable = async (): Promise<string> => { throw new Error("System credential protection is unavailable."); };
      this.configuration = new ConfigurationService(this.db, root, options.protector ?? { available: async () => false, encrypt: unavailable, decrypt: unavailable }, options.onConfigurationChanged);
      this.sessions = new SessionService(this.db, this.objects, this.configuration, options.onSessionChanged, options.adapterFactory);
    } catch (error) { this.db.close(); throw error; }
  }
  async close(): Promise<void> {
    this.configuration.close();
    await this.sessions.close();
    this.db.close();
  }

  execute(raw: unknown): AppSnapshot {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError("invalid_request", "Invalid application command.");
    const command = parsed.data;
    if (command.type === "workspace.read") return this.snapshot(command.session_id, command.at);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.mutate(command);
      const snapshot = this.snapshot(command.session_id);
      this.db.exec("COMMIT");
      if (command.type !== "view.set" && command.type !== "viewport.set") this.sessions.notify(command.session_id);
      return snapshot;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private requireSession(id: string, at?: string) {
    try { return at === undefined ? this.sessions.tree.path(id) : this.sessions.tree.path(id, at); }
    catch (error) { if (error instanceof SessionError) throw new ApplicationError("not_found", "Session not found."); throw error; }
  }

  private mutate(command: Exclude<Command, { type: "workspace.read" }>): void {
    const folded = foldWorkbench(this.requireSession(command.session_id));
    const has = (id: string) => folded.objects.some(o => o.id === id);
    const tree = this.sessions.tree;
    switch (command.type) {
      case "note.create": {
        // 笔记正文以不可变对象保存；回溯仅恢复存在性与引用。
        const contentRef = this.objects.put(command.content);
        const id = crypto.randomUUID();
        tree.append(command.session_id, { kind: "event", agentId: null, type: "resource_created", data: { id, title: command.title, contentRef }, model: null });
        this.addView(command.session_id, id, command.position);
        break;
      }
      case "directory.add": {
        // 目录是纯引用：只记录绝对路径，内容与存在性由 inspect 实时感知。
        if (!isAbsolute(command.path)) throw new ApplicationError("invalid_request", "Directory path must be absolute.");
        const id = crypto.randomUUID();
        tree.append(command.session_id, { kind: "event", agentId: null, type: "resource_created",
          data: { id, type: "directory", title: basename(command.path) || command.path, path: command.path }, model: null });
        this.addView(command.session_id, id, command.position);
        break;
      }
      case "object.remove": {
        const target = folded.objects.find(o => o.id === command.object_id);
        if (!target || target.kind === "agent") throw new ApplicationError("not_found", "Resource does not belong to this session.");
        // 先对每个已链接代理发出断开通知，再从工作台移除；移除本身只重建视图。
        for (const l of folded.links.filter(l => l.resourceId === target.id)) tree.append(command.session_id, { kind: "event", agentId: l.agentId,
          type: "resource_detached", data: { id: target.id }, model: `Resource "${target.title}" (resource_id: ${target.id}) is no longer linked to you.` });
        tree.append(command.session_id, { kind: "event", agentId: null, type: "object_removed", data: { id: target.id }, model: null });
        break;
      }
      case "link.set": {
        const agent = folded.objects.find(o => o.id === command.agent_id && o.kind === "agent");
        const resource = folded.objects.find(o => o.id === command.resource_id && o.kind !== "agent");
        if (!agent || !resource) throw new ApplicationError("not_found", "Agent or resource does not belong to this session.");
        const linked = folded.links.some(l => l.agentId === agent.id && l.resourceId === resource.id);
        if (linked === command.linked) break;
        tree.append(command.session_id, { kind: "event", agentId: agent.id, type: command.linked ? "resource_attached" : "resource_detached",
          data: { id: resource.id }, model: command.linked
            ? `Resource "${resource.title}" (type: ${resource.kind}, resource_id: ${resource.id}) is now linked to you. Tools: ${JSON.stringify(toolSummary(resource.kind === "directory" ? directoryType : noteType(this.objects)))}. Call them with resource_call.`
            : `Resource "${resource.title}" (resource_id: ${resource.id}) is no longer linked to you.` });
        break;
      }
      case "view.set": {
        if (!has(command.object_id)) throw new ApplicationError("not_found", "Object does not belong to this session.");
        const previous = this.db.prepare("SELECT * FROM object_views WHERE session_id = ? AND object_id = ?").get(command.session_id, command.object_id) as ViewRow | undefined;
        this.db.prepare(`INSERT INTO object_views VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, object_id) DO UPDATE SET x=excluded.x, y=excluded.y, hidden=excluded.hidden, collapsed=excluded.collapsed`)
          .run(command.session_id, command.object_id, command.position?.x ?? previous?.x ?? 0, command.position?.y ?? previous?.y ?? 0,
            command.hidden === undefined ? previous?.hidden ?? 0 : Number(command.hidden),
            command.collapsed === undefined ? previous?.collapsed ?? 0 : Number(command.collapsed));
        break;
      }
      case "viewport.set":
        this.db.prepare("INSERT INTO viewports VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET x=excluded.x, y=excluded.y, zoom=excluded.zoom")
          .run(command.session_id, command.viewport.x, command.viewport.y, command.viewport.zoom);
        break;
    }
  }

  private addView(sessionId: string, objectId: string, position: Point): void {
    this.db.prepare("INSERT INTO object_views (session_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(sessionId, objectId, position.x, position.y);
  }

  /** 工作台状态 = 当前游标路径上的事件折叠；不完整节点与旁支不影响对象集合。 */
  private snapshot(sessionId?: string, at?: string): AppSnapshot {
    const sessions = this.sessions.tree.list().map(s => ({ id: s.id, title: s.title, created_at: s.createdAt }));
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get() as { id: string; title: string };
    const result: AppSnapshot = { workspace, sessions, session: null };
    if (!sessionId) return result;
    const folded = foldWorkbench(this.requireSession(sessionId, at));
    const objects: WorkbenchObject[] = folded.objects.map(o => {
      if (o.kind === "agent") return { id: o.id, kind: "agent", title: o.title, content: null, content_available: false };
      if (o.kind === "directory") return { id: o.id, kind: "directory", title: o.title, content: String(o.data.path), content_available: true };
      const ref = typeof o.data.contentRef === "string" ? o.data.contentRef : null;
      const content = ref ? this.objects.get(ref) : null;
      return { id: o.id, kind: "note", title: o.title, content, content_available: content !== null };
    });
    const rows = this.db.prepare("SELECT * FROM object_views WHERE session_id = ?").all(sessionId) as ViewRow[];
    const viewport = this.db.prepare("SELECT x, y, zoom FROM viewports WHERE session_id = ?").get(sessionId) as Viewport | undefined;
    const meta = sessions.find(s => s.id === sessionId)!;
    result.session = { ...meta, objects,
      links: folded.links.map(l => ({ agent_id: l.agentId, resource_id: l.resourceId })),
      views: rows.filter(r => objects.some(o => o.id === r.object_id)).map(r => ({
        object_id: r.object_id, position: { x: r.x, y: r.y }, hidden: !!r.hidden, collapsed: !!r.collapsed })),
      viewport: viewport ?? { x: 0, y: 0, zoom: 1 }, at: at ?? null };
    return snapshotSchema.parse(result);
  }
}
