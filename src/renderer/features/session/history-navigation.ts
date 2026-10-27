import type { ReactNode } from "react";
import type { RecordRenderContext } from "@asterism/sdk/renderer";
import { toRecord } from "../../../plugins/records";
import type { ViewRegistry } from "../../modules/registry";
import type { Json } from "@asterism/sdk/contracts";

import type { SessionNode } from "../../../shared/session";
import { historyMessages } from "../../messages/history";
import { getI18n } from "../../shared/i18n";

export type HistoryResource = { id: string; kind: string; title: string };
export type HistoryEntry = { node: SessionNode; label: string; icon?: ReactNode; row?: (label: string) => ReactNode; scope: "session" | "resource"; resource: HistoryResource | null };
export type HistoryView = { kind: "all" | "session" | "resources" } | { kind: "resource"; resourceId: string };
const record = (value: Json): Record<string, Json> => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const snippet = (value: string) => value.slice(0, 500).replace(/\s+/gu, " ").trim() || "…";

/** Filter by record source; a tool target or an object in a workbench link is not the record's issuer. */
export function matchesHistoryView(entry: HistoryEntry, view: HistoryView): boolean {
  switch (view.kind) {
    case "all": return true;
    case "session": return entry.scope === "session";
    case "resources": return entry.scope === "resource";
    case "resource": return entry.scope === "resource" && entry.resource?.id === view.resourceId;
  }
}

/** Source options come from viewable records across the entire history, retaining removed sources and sources on other branches while omitting resources with no self-originated records. */
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

/** Metadata comes from resource creation records across the whole tree, so sources remain identifiable when historical objects are removed or on other branches. */
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

/** Preserve input append order and node identity; record contract providers register summaries and icons, while the host distinguishes only sources. */
export function historyEntries(nodes: readonly SessionNode[], views: Pick<ViewRegistry, "record" | "resource">): HistoryEntry[] {
  const resources = historyResources(nodes);
  const i18n = getI18n();
  // Branches inherit renames from parent nodes; only rename events copy the name map, and subsequent nodes share that branch's immutable version.
  const titlesByNode = new Map<string, ReadonlyMap<string, string>>();
  const initialTitles = new Map<string, string>();
  return nodes.map((node, index) => {
    let titles = titlesByNode.get(node.parentId ?? "") ?? initialTitles;
    if (node.contract === "resource_renamed") {
      const data = record(node.data);
      if (typeof data.id === "string" && typeof data.title === "string") titles = new Map(titles).set(data.id, data.title);
    }
    titlesByNode.set(node.id, titles);
    const context: RecordRenderContext = {
      resourceTitle: id => titles.get(id) ?? resources.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource),
      resourceLabel: kind => views.resource(kind).label,
      text: value => i18n.text(value),
      describe: item => views.record(item, context),
    };
    const item = toRecord(node, index + 1);
    const view = views.record(item, context);
    // Source depends only on record ownership: a record with an associated object is a resource record, otherwise it is a session-level record; the host does not know specific contracts.
    const owner = item.source?.resource?.id ?? null;
    const resource = owner ? resources.get(owner) : null;
    const label = view ? i18n.text(view.label) : i18n.formatMessage(historyMessages.unknownRecord, { id: item.contract.id });
    return { node, label: snippet(label), icon: view?.icon, row: view?.row, scope: owner ? "resource" : "session",
      resource: resource ? { ...resource, title: context.resourceTitle(resource.id) } : null };
  });
}

/** “Before” targets the real parent node, unaffected by list filtering. */
export function historyBefore(nodes: readonly SessionNode[], node: SessionNode): string | null {
  return nodes.some(parent => parent.id === node.parentId) ? node.parentId : null;
}
