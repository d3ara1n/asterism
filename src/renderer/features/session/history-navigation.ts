import type { ReactNode } from "react";
import type { RecordRenderContext } from "@atelier/sdk/renderer";
import { toRecord } from "../../../plugins/records";
import type { ViewRegistry } from "../../modules/registry";
import type { Json } from "@atelier/sdk/contracts";

import type { SessionNode } from "../../../shared/session";
import { historyMessages } from "../../messages/history";
import { getI18n } from "../../shared/i18n";

export type HistoryResource = { id: string; kind: string; title: string };
export type HistoryEntry = { node: SessionNode; label: string; icon?: ReactNode; row?: (label: string) => ReactNode; scope: "session" | "resource"; resource: HistoryResource | null };
export type HistoryView = { kind: "all" | "session" | "resources" } | { kind: "resource"; resourceId: string };
const record = (value: Json): Record<string, Json> => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const snippet = (value: string) => value.slice(0, 500).replace(/\s+/gu, " ").trim() || "…";

/** 按记录来源筛选；工具的目标和工作台链接中的对象不等于记录的发出者。 */
export function matchesHistoryView(entry: HistoryEntry, view: HistoryView): boolean {
  switch (view.kind) {
    case "all": return true;
    case "session": return entry.scope === "session";
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
    if (node.contract !== "resource_created") continue;
    const data = record(node.data);
    if (typeof data.id === "string" && typeof data.type === "string") {
      result.set(data.id, { id: data.id, kind: data.type, title: typeof data.title === "string" ? data.title : getI18n().formatMessage(historyMessages.unknownResource) });
    }
  }
  return result;
}

/** 保持输入的追加次序和节点身份；摘要与图标由记录契约的提供方注册，宿主只区分来源。 */
export function historyEntries(nodes: readonly SessionNode[], views: Pick<ViewRegistry, "record" | "resource">): HistoryEntry[] {
  const resources = historyResources(nodes);
  const i18n = getI18n();
  const context: RecordRenderContext = {
    resourceTitle: id => resources.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource),
    resourceLabel: kind => views.resource(kind).label,
    text: value => i18n.text(value),
    describe: item => views.record(item, context),
  };
  return nodes.map((node, index) => {
    const item = toRecord(node, index + 1);
    const view = views.record(item, context);
    // 来源只看记录归属：有归属对象是资源记录，否则是会话级记录；宿主不认识具体契约。
    const owner = item.source.resource?.id ?? null;
    const label = view ? i18n.text(view.label) : i18n.formatMessage(historyMessages.unknownRecord, { id: item.contract.id });
    return { node, label: snippet(label), icon: view?.icon, row: view?.row, scope: owner ? "resource" : "session",
      resource: owner ? resources.get(owner) ?? null : null };
  });
}

/** “之前”定位真实父节点，不受列表过滤影响。 */
export function historyBefore(nodes: readonly SessionNode[], node: SessionNode): string | null {
  return nodes.some(parent => parent.id === node.parentId) ? node.parentId : null;
}
