import type { ReactNode } from "react";
import type { RecordRenderContext } from "@asterism-app/sdk/renderer";
import type { ViewRegistry } from "../../modules/registry";
import { ResourceCreated, ResourceRenamed, type SessionRecord } from "@asterism-app/sdk/contracts";

import type { SessionNode, SessionNodeInfo } from "../../../shared/session";
import { historyMessages } from "../../messages/history";
import { getI18n } from "../../shared/i18n";

export type HistoryResource = { id: string; kind: string; title: string };
export type HistoryEntry = { node: Omit<SessionNode, "data" | "model" | "recipient">; label: string; icon?: ReactNode; row?: (label: string) => ReactNode; scope: "session" | "resource"; resource: HistoryResource | null };
export type HistoryView = { kind: "all" | "session" | "resources" } | { kind: "resource"; resourceId: string };
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

/** Keep only resource names and rename events after reading their owning contracts. */
export function historyDirectory(nodes: readonly SessionNodeInfo[], records: readonly SessionRecord[]) {
  const resources = new Map<string, HistoryResource>(), renames = new Map<string, { id: string; title: string }>();
  for (const record of records) {
    const created = ResourceCreated.decode(record);
    if (created?.status === "known") {
      const { id, title, type } = created.data;
      resources.set(id, { id, title, kind: type });
    }
    const renamed = ResourceRenamed.decode(record);
    if (renamed?.status === "known") renames.set(record.id, renamed.data);
  }
  const titles = new Map<string, ReadonlyMap<string, string>>(), empty = new Map<string, string>();
  for (const node of nodes) {
    const inherited = titles.get(node.parentId ?? "") ?? empty;
    const rename = renames.get(node.id);
    titles.set(node.id, rename ? new Map(inherited).set(rename.id, rename.title) : inherited);
  }
  return { resources, titles };
}
export type HistoryDirectory = ReturnType<typeof historyDirectory>;

export function historyEntry(info: SessionNodeInfo, record: SessionRecord | null, directory: HistoryDirectory,
  views: Pick<ViewRegistry, "record" | "resource">): HistoryEntry {
  const i18n = getI18n(), titles = directory.titles.get(info.id);
  const context: RecordRenderContext = {
    resourceTitle: id => titles?.get(id) ?? directory.resources.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource),
    resourceLabel: kind => views.resource(kind).label,
    text: value => i18n.text(value),
    describe: item => views.record(item, context),
  };
  const owner = info.source?.resource?.id, resource = owner ? directory.resources.get(owner) : undefined;
  const view = record ? views.record(record, context) : null;
  return { node: info, label: view ? snippet(i18n.text(view.label)) : i18n.formatMessage(historyMessages.unknownRecord, { id: info.contract }),
    icon: view?.icon, row: view?.row, scope: owner ? "resource" : "session",
    resource: resource ? { ...resource, title: context.resourceTitle(resource.id) } : null };
}
