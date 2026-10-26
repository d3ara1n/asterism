import type { DatabaseSync } from "node:sqlite";
import type { ResourceRegistry } from "../resources/registry.ts";
import { createResourceId } from "../resources/id.ts";
import type { FoldedObject } from "../session/fold.ts";
import { SessionError, type SessionTree } from "../session/tree.ts";
import type { Json } from "@asterism/sdk/contracts";

import { type WorkbenchCommand, type WorkbenchSnapshot, type Point, type Viewport } from "../shared/workbench.ts";
import type { ContentStore, ContentLease, ContentAccess } from "./content-store.ts";
import { defaultCardPosition } from "../shared/workbench-layout.ts";
import { placeObject } from "../shared/workbench-placement.ts";
import { cardSize } from "../shared/workbench-sizing.ts";

/** 宿主工作台写入的会话级来源。 */
const host = null;

type ViewRow = { object_id: string; x: number; y: number; hidden: number; collapsed: number; width: number | null; height: number | null };

/** 会话的资源事件与独立布局；当前存在性与链接统一由会话树重建。 */
export class SessionWorkbench {
  constructor(private readonly db: DatabaseSync, private readonly tree: SessionTree,
    private readonly resources: ResourceRegistry,
    private readonly tools: (sessionId: string, receiverId: string, resource: FoldedObject) => Json,
    private readonly content?: ContentStore) {}

  /** 通用资源创建：资源贡献给出标题并保存对象数据；创建事件保存身份、类型与标题。 */
  create(sessionId: string, kind: string, input: Json, position: Point, content?: ContentLease): string {
    return this.createWith(sessionId, kind, createResourceId(), input, position, content);
  }
  createWith(sessionId: string, kind: string, id: string, input: Json, position: Point, content?: ContentLease): string {
    const controller = this.resources.controller(kind);
    if (!controller?.create) throw new SessionError("invalid_request", "This resource type cannot be created here.");
    const { title, data } = controller.create(sessionId, id, input, content);
    return this.insert(sessionId, { id, kind, title, data: data ?? {} }, position, { scope: content });
  }

  /** 将已初始化的对象数据建立为新身份；普通创建与模板实例化共用历史和内容登记。 */
  insert(sessionId: string, object: { id: string; kind: string; title: string; data: Record<string, Json> },
    position: Point, access: Pick<ContentAccess, "scope" | "templateId"> = {}): string {
    const { id, kind, title, data } = object;
    const node = this.tree.appendToTimeline(sessionId, { source: host, recipient: null, contract: "resource_created", data: { ...data, id, type: kind, title }, model: null });
    this.content?.bind({ sessionId, objectId: id, ...access }, { kind: "record", id: node.id }, data);
    this.addView(sessionId, id, position);
    return id;
  }

  /** 按资源声明与用户覆盖预留完整展开尺寸，创建者附近优先，已有对象保持原位。 */
  placement(sessionId: string, kind: string, nearObjectId?: string): Point {
    const objects = this.tree.workbench(sessionId).objects;
    const views = this.db.prepare("SELECT * FROM object_views WHERE session_id = ?").all(sessionId) as ViewRow[];
    const byId = new Map(views.map(view => [view.object_id, view]));
    const nodes = objects.flatMap(object => {
      const view = byId.get(object.id);
      if (view?.hidden) return [];
      const override = view?.width != null && view.height != null ? { width: view.width, height: view.height } : null;
      return [{ id: object.id, position: view ? { x: view.x, y: view.y } : defaultCardPosition,
        ...cardSize(this.resources.card(object.kind), override) }];
    });
    const size = cardSize(this.resources.card(kind));
    const near = nodes.find(node => node.id === nearObjectId);
    const center = near
      ? { x: near.position.x + near.width / 2, y: near.position.y + near.height / 2 }
      : { x: defaultCardPosition.x + size.width / 2, y: defaultCardPosition.y + size.height / 2 };
    return placeObject(center, size, nodes);
  }

  mutate(command: WorkbenchCommand): void {
    const folded = this.tree.workbench(command.sessionId);
    const tree = this.tree;
    switch (command.type) {
      case "object.rename": {
        const target = folded.objects.find(o => o.id === command.objectId);
        if (!target) throw new SessionError("not_found", "Object does not belong to this session.");
        if (target.title === command.title) break;
        tree.appendToTimeline(command.sessionId, { source: host, recipient: null, contract: "resource_renamed",
          data: { id: target.id, title: command.title }, model: null });
        break;
      }
      case "object.remove": {
        const target = folded.objects.find(o => o.id === command.objectId);
        if (!target) throw new SessionError("not_found", "Object does not belong to this session.");
        // 对象移除时解除全部入向与出向链接。
        for (const link of folded.links.filter(l => l.resourceId === target.id || l.receiverId === target.id)) {
          const resource = folded.objects.find(o => o.id === link.resourceId)!;
          tree.appendToTimeline(command.sessionId, { source: host, recipient: link.receiverId, contract: "resource_detached", data: { id: resource.id, receiverId: link.receiverId },
            model: link.receiverId === target.id ? null : `Resource "${resource.title}" (resource_id: ${resource.id}) has been detached.` });
        }
        tree.appendToTimeline(command.sessionId, { source: host, recipient: null, contract: "object_removed", data: { id: target.id }, model: null });
        break;
      }
      case "link.set": {
        // 终点必须声明接收链接；起点是任意其他资源。
        const receiver = folded.objects.find(o => o.id === command.receiverId && this.resources.receivesLinks(o.kind));
        const resource = folded.objects.find(o => o.id === command.resourceId);
        if (!receiver || !resource) throw new SessionError("not_found", "The link requires a resource and a receiver that supports links in this session.");
        if (receiver.id === resource.id) throw new SessionError("invalid_request", "A link requires two distinct resources.");
        if (folded.links.some(l => l.receiverId === receiver.id && l.resourceId === resource.id) === command.linked) break;
        tree.appendToTimeline(command.sessionId, { source: host, recipient: receiver.id, contract: command.linked ? "resource_attached" : "resource_detached",
          data: { id: resource.id, receiverId: receiver.id }, model: command.linked
            ? `Resource "${resource.title}" (type: ${resource.kind}, resource_id: ${resource.id}) is now linked to you. Tools: ${JSON.stringify(this.tools(command.sessionId, receiver.id, resource))}.`
            : `Resource "${resource.title}" (resource_id: ${resource.id}) has been detached.` });
        break;
      }
      case "view.set": {
        // 布局不属于历史路径；旁支和已移除对象的卡片也可以调整。
        const exists = tree.resourceRef(command.objectId)?.sessionId === command.sessionId;
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
      case "views.position":
        for (const { objectId, position } of command.positions)
          this.mutate({ type: "view.set", sessionId: command.sessionId, objectId, position });
        break;
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
    return { id: sessionId, title, objects, links: folded.links, ...this.layout(sessionId) };
  }
  object(sessionId: string, id: string) {
    const object = this.tree.workbench(sessionId).objects.find(item => item.id === id);
    return object ? { id: object.id, kind: object.kind, title: object.title, presentation: this.resources.project(object) } : null;
  }
  layout(sessionId: string): Pick<WorkbenchSnapshot, "views" | "viewport"> {
    const ids = new Set(this.tree.workbench(sessionId).objects.map(object => object.id));
    const rows = this.db.prepare("SELECT * FROM object_views WHERE session_id = ?").all(sessionId) as ViewRow[];
    const viewport = this.db.prepare("SELECT x, y, zoom FROM viewports WHERE session_id = ?").get(sessionId) as Viewport | undefined;
    return {
      views: rows.filter(row => ids.has(row.object_id)).map(row => ({
        objectId: row.object_id, position: { x: row.x, y: row.y }, hidden: !!row.hidden, collapsed: !!row.collapsed,
        size: row.width === null || row.height === null ? null : { width: row.width, height: row.height },
      })), viewport: viewport ?? { x: 0, y: 0, zoom: 1 } };
  }
}
