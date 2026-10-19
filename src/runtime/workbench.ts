import type { DatabaseSync } from "node:sqlite";
import type { ResourceRegistry } from "../resources/registry.ts";
import { createResourceId } from "../resources/id.ts";
import type { FoldedObject } from "../session/fold.ts";
import { SessionError, type SessionTree } from "../session/tree.ts";
import type { Json } from "@atelier/sdk/contracts";

import { workbenchSnapshotSchema, type WorkbenchCommand, type WorkbenchSnapshot, type Point, type Viewport } from "../shared/workbench.ts";
import type { ContentStore, ContentLease } from "./content-store.ts";
import { defaultCardPosition, fallbackCardWidth, fallbackCardHeight } from "../shared/workbench-layout.ts";
import { placeObject } from "../shared/workbench-placement.ts";

/** 宿主工作台写入的会话级来源。 */
const host = null;

type ViewRow = { object_id: string; x: number; y: number; hidden: number; collapsed: number; width: number | null; height: number | null };

/** 会话的资源事件与独立布局；当前存在性与链接统一由会话树重建。 */
export class SessionWorkbench {
  constructor(private readonly db: DatabaseSync, private readonly tree: SessionTree,
    private readonly resources: ResourceRegistry,
    private readonly tools: (sessionId: string, agentId: string, resource: FoldedObject) => Json,
    private readonly content?: ContentStore) {}

  /** 通用资源创建：资源贡献给出标题并保存对象数据；创建事件只记录身份与类型。 */
  create(sessionId: string, kind: string, input: Json, position: Point, content?: ContentLease): string {
    return this.createWith(sessionId, kind, createResourceId(), input, position, content);
  }
  createWith(sessionId: string, kind: string, id: string, input: Json, position: Point, content?: ContentLease): string {
    const controller = this.resources.controller(kind);
    if (!controller?.create) throw new SessionError("invalid_request", "This resource type cannot be created here.");
    const { title, data } = controller.create(sessionId, id, input, content);
    const node = this.tree.appendToTimeline(sessionId, { source: host, recipient: null, contract: "resource_created", data: { ...data, id, type: kind, title }, model: null });
    this.content?.bind({ sessionId, objectId: id, scope: content }, { kind: "record", id: node.id }, data ?? {});
    this.addView(sessionId, id, position);
    return id;
  }

  /** 后台没有鼠标与实时测量，复用空位算法并按已保存尺寸或公共回退尺寸放置。 */
  placement(sessionId: string): Point {
    const ids = new Set(this.tree.workbench(sessionId).objects.map(object => object.id));
    const views = this.db.prepare("SELECT * FROM object_views WHERE session_id = ?").all(sessionId) as ViewRow[];
    const size = { width: fallbackCardWidth, height: fallbackCardHeight };
    return placeObject({ x: defaultCardPosition.x + size.width / 2, y: defaultCardPosition.y + size.height / 2 }, size,
      views.filter(view => ids.has(view.object_id) && !view.hidden).map(view => ({
        id: view.object_id, position: { x: view.x, y: view.y }, width: view.width ?? fallbackCardWidth, height: view.height ?? fallbackCardHeight,
      })));
  }

  mutate(command: WorkbenchCommand): void {
    const folded = this.tree.workbench(command.sessionId);
    const tree = this.tree;
    switch (command.type) {
      case "object.remove": {
        const target = folded.objects.find(o => o.id === command.objectId);
        if (!target) throw new SessionError("not_found", "Object does not belong to this session.");
        // 代理同样是资源：入向与出向链接都解除。
        for (const link of folded.links.filter(l => l.resourceId === target.id || l.agentId === target.id)) {
          const resource = folded.objects.find(o => o.id === link.resourceId)!;
          tree.appendToTimeline(command.sessionId, { source: host, recipient: link.agentId, contract: "resource_detached", data: { id: resource.id, agentId: link.agentId },
            model: link.agentId === target.id ? null : `Resource "${resource.title}" (resource_id: ${resource.id}) is no longer linked to you.` });
        }
        tree.appendToTimeline(command.sessionId, { source: host, recipient: null, contract: "object_removed", data: { id: target.id }, model: null });
        break;
      }
      case "link.set": {
        // 终点必须声明接收链接；起点是任意其他资源。
        const agent = folded.objects.find(o => o.id === command.agentId && this.resources.receivesLinks(o.kind));
        const resource = folded.objects.find(o => o.id === command.resourceId);
        if (!agent || !resource) throw new SessionError("not_found", "Agent or resource does not belong to this session.");
        if (agent.id === resource.id) throw new SessionError("invalid_request", "An agent cannot be linked to itself.");
        if (folded.links.some(l => l.agentId === agent.id && l.resourceId === resource.id) === command.linked) break;
        tree.appendToTimeline(command.sessionId, { source: host, recipient: agent.id, contract: command.linked ? "resource_attached" : "resource_detached",
          data: { id: resource.id, agentId: agent.id }, model: command.linked
            ? `Resource "${resource.title}" (type: ${resource.kind}, resource_id: ${resource.id}) is now linked to you. Tools: ${JSON.stringify(this.tools(command.sessionId, agent.id, resource))}. Call them with resource_call.`
            : `Resource "${resource.title}" (resource_id: ${resource.id}) is no longer linked to you.` });
        break;
      }
      case "view.set": {
        // 布局不属于历史路径；旁支和已移除对象的卡片也可以调整。
        const exists = tree.nodes(command.sessionId).some(node => node.contract === "resource_created"
          && node.data !== null && typeof node.data === "object" && !Array.isArray(node.data) && node.data.id === command.objectId);
        if (!exists) throw new SessionError("not_found", "Object does not belong to this session.");
        const previous = this.db.prepare("SELECT * FROM object_views WHERE session_id = ? AND object_id = ?").get(command.sessionId, command.objectId) as ViewRow | undefined;
        const size = command.size === undefined
          ? { width: previous?.width ?? null, height: previous?.height ?? null }
          : command.size ?? { width: null, height: null };
        this.db.prepare(`INSERT INTO object_views (session_id, object_id, x, y, hidden, collapsed, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, object_id) DO UPDATE SET x=excluded.x, y=excluded.y, hidden=excluded.hidden, collapsed=excluded.collapsed,
          width=excluded.width, height=excluded.height`)
          .run(command.sessionId, command.objectId, command.position?.x ?? previous?.x ?? 0, command.position?.y ?? previous?.y ?? 0,
            command.hidden === undefined ? previous?.hidden ?? 0 : Number(command.hidden),
            command.collapsed === undefined ? previous?.collapsed ?? 0 : Number(command.collapsed), size.width, size.height);
        break;
      }
      case "viewport.set":
        this.db.prepare("INSERT INTO viewports VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET x=excluded.x, y=excluded.y, zoom=excluded.zoom")
          .run(command.sessionId, command.viewport.x, command.viewport.y, command.viewport.zoom);
        break;
    }
  }

  private addView(sessionId: string, objectId: string, position: Point): void {
    this.db.prepare("INSERT INTO object_views (session_id, object_id, x, y) VALUES (?, ?, ?, ?)").run(sessionId, objectId, position.x, position.y);
  }

  project(sessionId: string, title: string): WorkbenchSnapshot {
    const folded = this.tree.workbench(sessionId);
    const objects = folded.objects.map(object => ({ id: object.id, kind: object.kind, title: object.title, presentation: this.resources.project(object) }));
    const ids = new Set(objects.map(object => object.id));
    const rows = this.db.prepare("SELECT * FROM object_views WHERE session_id = ?").all(sessionId) as ViewRow[];
    const viewport = this.db.prepare("SELECT x, y, zoom FROM viewports WHERE session_id = ?").get(sessionId) as Viewport | undefined;
    return workbenchSnapshotSchema.parse({ id: sessionId, title, objects, links: folded.links,
      views: rows.filter(row => ids.has(row.object_id)).map(row => ({
        objectId: row.object_id, position: { x: row.x, y: row.y }, hidden: !!row.hidden, collapsed: !!row.collapsed,
        size: row.width === null || row.height === null ? null : { width: row.width, height: row.height },
      })), viewport: viewport ?? { x: 0, y: 0, zoom: 1 } });
  }
}
