import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { HistoryKernel } from "../history/kernel.ts";
import type { StoredEvent } from "../history/schema.ts";
import { commandSchema, snapshotSchema, type Command, type AppSnapshot, type AppError, type Point, type Viewport, type WorkbenchObject } from "../shared/contracts.ts";
import { ObjectStore, openDatabase } from "./storage.ts";
import { ConfigurationService } from "../configuration/service.ts";
import type { SecretProtector } from "../shared/secrets.ts";

export class ApplicationError extends Error {
  constructor(readonly code: AppError["code"], message: string) { super(message); }
}
type TaskRow = { id: string; branch_id: string; title: string; created_at: string };
type ViewRow = { object_id: string; x: number; y: number; hidden: number; collapsed: number };

/** 唯一应用命令入口；不依赖 Electron、React 或画布类型。 */
export class ApplicationService {
  readonly history: HistoryKernel;
  readonly configuration: ConfigurationService;
  private readonly db: DatabaseSync;
  private readonly objects: ObjectStore;
  constructor(root: string, options: { protector?: SecretProtector; onConfigurationChanged?: () => void } = {}) {
    this.db = openDatabase(root);
    try {
      this.history = new HistoryKernel(this.db);
      this.objects = new ObjectStore(join(root, "objects"));
      const unavailable = async (): Promise<string> => { throw new Error("System credential protection is unavailable."); };
      this.configuration = new ConfigurationService(this.db, root, options.protector ?? {
        available: async () => false, encrypt: unavailable, decrypt: unavailable,
      }, options.onConfigurationChanged);
    } catch (error) { this.db.close(); throw error; }
  }
  close(): void { this.configuration.close(); this.history.close(); }

  execute(raw: unknown): AppSnapshot {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError("invalid_request", "Invalid application command.");
    const command = parsed.data;
    if (command.type === "workspace.read") return this.snapshot(command.task_id, command.at_seq);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const taskId = this.mutate(command);
      // 响应构造/校验失败也必须回滚，不能向调用方报告失败却留下已提交命令。
      const snapshot = this.snapshot(taskId);
      this.db.exec("COMMIT");
      return snapshot;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private task(id: string): TaskRow {
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    if (!task) throw new ApplicationError("not_found", "Task not found.");
    return task;
  }

  private mutate(command: Exclude<Command, { type: "workspace.read" }>): string {
    if (command.type === "task.create") {
      const created = this.history.createTask(command.title);
      this.db.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?)").run(created.task_id, created.branch_id, command.title, new Date().toISOString());
      return created.task_id;
    }
    const task = this.task(command.task_id);
    const projection = this.history.reconstruct(this.history.head(task.branch_id));
    const requireObject = (id: string) => {
      if (![...projection.agent_ids, ...projection.resource_ids].includes(id)) {
        throw new ApplicationError("not_found", "Object does not belong to this task.");
      }
    };
    switch (command.type) {
      case "agent.create": {
        const created = this.history.createAgent(task.branch_id, { title: command.title });
        this.addView(task.id, created.agent_id, command.position);
        break;
      }
      case "note.create": {
        const content_ref = this.objects.put(command.content);
        const created = this.history.createResource(task.branch_id, {
          type: "note", title: command.title, content_ref,
          capabilities: { history_viewing: true, state_restore: false },
        });
        this.addView(task.id, created.resource_id, command.position);
        break;
      }
      case "binding.set": {
        if (!projection.agent_ids.includes(command.agent_id) || !projection.resource_ids.includes(command.resource_id)) {
          throw new ApplicationError("not_found", "Agent or resource does not belong to this task.");
        }
        if (projection.pending.some(p => p.agent_id === command.agent_id && p.resource_id === command.resource_id)) {
          throw new ApplicationError("conflict", "A binding change is already pending.");
        }
        const bound = projection.bindings_by_agent[command.agent_id]?.resources.some(r => r.resource_id === command.resource_id) ?? false;
        if (bound !== command.attached) this.history.requestBinding(task.branch_id, {
          agent_id: command.agent_id, resource_id: command.resource_id,
          action: command.attached ? "attach" : "detach",
          permissions: command.attached ? ["read"] : [],
        });
        break;
      }
      case "view.set": {
        requireObject(command.object_id);
        const previous = this.db.prepare("SELECT * FROM object_views WHERE task_id = ? AND object_id = ?").get(task.id, command.object_id) as ViewRow | undefined;
        this.db.prepare(`INSERT INTO object_views VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id, object_id) DO UPDATE SET x=excluded.x, y=excluded.y, hidden=excluded.hidden, collapsed=excluded.collapsed`)
          .run(task.id, command.object_id, command.position?.x ?? previous?.x ?? 0, command.position?.y ?? previous?.y ?? 0,
            command.hidden === undefined ? previous?.hidden ?? 0 : Number(command.hidden),
            command.collapsed === undefined ? previous?.collapsed ?? 0 : Number(command.collapsed));
        break;
      }
      case "viewport.set":
        this.db.prepare(`INSERT INTO viewports VALUES (?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET x=excluded.x, y=excluded.y, zoom=excluded.zoom`)
          .run(task.id, command.viewport.x, command.viewport.y, command.viewport.zoom);
        break;
    }
    return task.id;
  }

  private addView(taskId: string, objectId: string, position: Point): void {
    this.db.prepare("INSERT INTO object_views (task_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(taskId, objectId, position.x, position.y);
  }

  private snapshot(taskId?: string, atSeq?: number): AppSnapshot {
    const tasks = this.db.prepare("SELECT * FROM tasks ORDER BY created_at, id").all() as TaskRow[];
    const workspace = this.db.prepare("SELECT * FROM workspace LIMIT 1").get() as { id: string; title: string };
    const result: AppSnapshot = { workspace, tasks, task: null, execution: { available: false, reason: "execution_not_connected" } };
    // 未指定任务时只返回列表摘要；启动和首页均不读取任何会话正文。
    const selectedId = taskId;
    if (!selectedId) {
      if (atSeq !== undefined) throw new ApplicationError("invalid_request", "History requires a task.");
      return result;
    }
    const task = this.task(selectedId);
    const allEvents = this.history.eventsOn(task.branch_id);
    const head = allEvents.at(-1)!;
    const position = atSeq === undefined ? head : allEvents.find(e => e.seq === atSeq);
    if (!position) throw new ApplicationError("not_found", "History position not found.");
    const events = allEvents.filter(e => e.seq <= position.seq);
    const projection = this.history.reconstruct({ branch_id: task.branch_id, event_id: position.event_id, seq: position.seq });
    const objects: WorkbenchObject[] = [];
    for (const event of events) {
      if (event.type === "agent_created") objects.push({
        id: event.payload.agent_id, kind: "agent", title: event.payload.title ?? "Agent",
        content: null, content_available: false,
      });
      if (event.type === "resource_created" && event.payload.type === "note") {
        const content = event.payload.content_ref ? this.objects.get(event.payload.content_ref) : null;
        objects.push({ id: event.payload.resource_id, kind: "note", title: event.payload.title ?? "Note", content, content_available: content !== null });
      }
    }
    const bindings = Object.entries(projection.bindings_by_agent).flatMap(([agent_id, value]) => value.resources.map(r => ({
      agent_id, resource_id: r.resource_id, pending: projection.pending.find(p => p.agent_id === agent_id && p.resource_id === r.resource_id)?.action ?? null,
    })));
    for (const pending of projection.pending) {
      if (!bindings.some(b => b.agent_id === pending.agent_id && b.resource_id === pending.resource_id)) bindings.push({
        agent_id: pending.agent_id, resource_id: pending.resource_id, pending: pending.action,
      });
    }
    const rows = this.db.prepare("SELECT * FROM object_views WHERE task_id = ?").all(task.id) as ViewRow[];
    const viewport = this.db.prepare("SELECT x, y, zoom FROM viewports WHERE task_id = ?").get(task.id) as Viewport | undefined;
    result.task = {
      ...task, head_seq: head.seq, at_seq: position.seq, historical: atSeq !== undefined,
      objects, bindings,
      views: rows.filter(row => objects.some(o => o.id === row.object_id)).map(row => ({
        object_id: row.object_id, position: { x: row.x, y: row.y }, hidden: !!row.hidden, collapsed: !!row.collapsed,
      })),
      viewport: viewport ?? { x: 0, y: 0, zoom: 1 },
      history: allEvents.map(event => ({
        seq: event.seq, event_id: event.event_id, type: event.type, recorded_at: event.recorded_at, label: eventLabel(event),
      })),
    };
    return snapshotSchema.parse(result);
  }
}

function eventLabel(event: StoredEvent): string {
  switch (event.type) {
    case "task_created": return event.payload.title ?? "Task created";
    case "branch_created": return "Branch created";
    case "agent_created": return event.payload.title ?? "Agent created";
    case "resource_created": return event.payload.title ?? "Resource added";
    case "binding_requested": return event.payload.action === "attach" ? "Access requested" : "Access removal requested";
    case "bindings_applied": return "Access updated";
    case "turn_started": return "Turn started";
    case "turn_ended": return "Turn " + event.payload.status;
    case "operation_started": return event.payload.name;
    case "operation_finished": return "Operation " + event.payload.status;
    case "subagent_result_delivered": return "Agent result delivered";
    case "config_applied": return "Configuration applied";
  }
}
