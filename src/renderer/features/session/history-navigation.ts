import type { Json } from "@atelier/sdk/contracts";
import type { SessionNode } from "../../../shared/session";
import { selectable } from "../../../shared/session-path";
import { t } from "../../shared/i18n";

export type HistoryResource = { id: string; kind: string; title: string };
export type HistoryEntry = { node: SessionNode; label: string; scope: "session" | "resource"; resource: HistoryResource | null };
export type HistoryView = { kind: "all" | "workbench" | "resources" } | { kind: "resource"; resourceId: string };
const workbenchEvents = new Set(["resource_created", "object_added", "object_removed", "resource_attached", "resource_detached"]);
const record = (value: Json): Record<string, Json> => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const snippet = (value: string) => value.slice(0, 500).replace(/\s+/gu, " ").trim() || "…";

/** 按记录来源筛选；工具的目标和工作台链接中的对象不等于记录的发出者。 */
export function matchesHistoryView(entry: HistoryEntry, view: HistoryView): boolean {
  switch (view.kind) {
    case "all": return true;
    case "workbench": return entry.scope === "session" && entry.node.kind === "event";
    case "resources": return entry.scope === "resource";
    case "resource": return entry.scope === "resource" && entry.resource?.id === view.resourceId;
  }
}

/** 来源选项来自整份历史的可查看记录，保留已移除及其他分支的来源，省略没有自发记录的资源。 */
export function historyResourceViews(entries: readonly HistoryEntry[]): Array<{ resource: HistoryResource; count: number }> {
  const sources = new Map<string, { resource: HistoryResource; count: number }>();
  for (const entry of entries) {
    if (entry.scope !== "resource" || !entry.resource) continue;
    const source = sources.get(entry.resource.id);
    if (source) source.count++;
    else sources.set(entry.resource.id, { resource: entry.resource, count: 1 });
  }
  return [...sources.values()];
}

/** 元数据来自整棵树的资源创建记录，历史对象被移除或处于其他分支时仍能识别来源。 */
export function historyResources(nodes: readonly SessionNode[]): Map<string, HistoryResource> {
  const result = new Map<string, HistoryResource>();
  for (const node of nodes) {
    if (node.kind !== "event" || node.type !== "resource_created") continue;
    const data = record(node.data);
    if (typeof data.id === "string" && typeof data.type === "string") {
      result.set(data.id, { id: data.id, kind: data.type, title: typeof data.title === "string" ? data.title : t.unknownResource });
    }
  }
  return result;
}

/** 保持输入的追加次序和节点身份；不按 response、时间戳或来源重新排序。 */
export function historyEntries(nodes: readonly SessionNode[], typeLabel: (kind: string) => string): HistoryEntry[] {
  const resources = historyResources(nodes);
  const name = (id: unknown) => typeof id === "string" ? resources.get(id)?.title ?? t.unknownResource : t.unknownResource;
  return nodes.filter(selectable).map(node => {
    let label: string;
    let resourceId: unknown = node.agentId;
    const sessionEvent = node.kind === "event" && workbenchEvents.has(node.type) || node.kind === "notice" && node.agentId === null;
    switch (node.kind) {
      case "message": label = t.eventInput(node.text); break;
      case "thinking": label = t.eventThinking(node.text); break;
      case "text": label = node.text; break;
      case "notice": label = node.message; break;
      case "toolcall": {
        const args = record(node.arguments);
        const target = record(args.target ?? null);
        const tool = node.name === "resource_call" && typeof args.tool === "string" ? args.tool : node.name;
        label = typeof target.path === "string" ? `${tool} · ${target.path}` : tool;
        break;
      }
      case "event": {
        const data = record(node.data), title = name(data.id ?? data.resourceId);
        resourceId = node.agentId ?? data.resourceId ?? data.id;
        switch (node.type) {
          case "resource_created": label = t.eventCreated(typeLabel(String(data.type ?? "")), title); break;
          case "object_added": label = t.eventAdded(title); break;
          case "object_removed": label = t.eventRemoved(title); break;
          case "resource_attached": label = t.eventLinked(title, name(node.agentId)); break;
          case "resource_detached": label = t.eventDetached(title, name(node.agentId)); break;
          default: label = node.type;
        }
      }
    }
    return { node, label: snippet(label), scope: sessionEvent ? "session" : "resource",
      resource: !sessionEvent && typeof resourceId === "string" ? resources.get(resourceId) ?? null : null };
  });
}

/** “之前”沿真实父链定位，跳过契约明确不可查看的不完整块，不受列表过滤影响。 */
export function historyBefore(nodes: readonly SessionNode[], node: SessionNode): string | null {
  const byId = new Map(nodes.map(item => [item.id, item]));
  let id = node.parentId;
  const seen = new Set<string>();
  while (id !== null) {
    const parent = byId.get(id);
    if (!parent || seen.has(id)) return null;
    if (selectable(parent)) return id;
    seen.add(id); id = parent.parentId;
  }
  return null;
}
