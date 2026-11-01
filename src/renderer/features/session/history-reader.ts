import { useCallback, useEffect, useMemo, useState } from "react";
import { ResourceCreated, ResourceRenamed } from "@asterism-app/sdk/contracts";
import { useI18n, useSessionRead, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import type { SessionNodeInfo } from "../../../shared/session";
import type { ViewRegistry } from "../../modules/registry";
import { historyDirectory, historyEntry, type HistoryDirectory } from "./history-navigation";
import { commonMessages } from "@asterism-app/ui/messages/common";
const emptyMatches: ReadonlySet<string> = new Set();

export const readHistoryDirectory = async (snapshot: RendererSessionSnapshot, signal: AbortSignal) => historyDirectory(
  snapshot.records.index({ scope: "session" }).map(info => ({ ...info, contract: info.contract.id })),
  await snapshot.records.all({ scope: "session", contracts: [ResourceCreated.id, ResourceRenamed.id] }, { signal }));

export function useHistoryEntry(snapshot: RendererSessionSnapshot | null, info: SessionNodeInfo | undefined,
  directory: HistoryDirectory | null, registry: ViewRegistry) {
  const i18n = useI18n();
  const read = useSessionRead(snapshot, useCallback(async (snapshot, signal) => {
    if (!info || !directory) return null;
    const records = await snapshot.records.all({ scope: "session", ids: [info.id] }, { signal });
    return historyEntry(info, records[0] ?? null, directory, registry);
  }, [info, directory, registry, i18n]), { keepPrevious: true, key: info?.id });
  return read;
}

/** Searches every candidate in bounded batches, retaining matching identities rather than bodies or row closures. */
export function useHistorySearch(snapshot: RendererSessionSnapshot | null, candidates: readonly SessionNodeInfo[],
  directory: HistoryDirectory | null, registry: ViewRegistry, query: string) {
  const i18n = useI18n();
  const [attempt, retry] = useState(0);
  const request = useMemo(() => snapshot && directory && query ? { snapshot, candidates, directory, registry, query, i18n } : null,
    [snapshot, candidates, directory, registry, query, i18n, attempt]);
  const [state, setState] = useState<{ request: NonNullable<typeof request>; ids: ReadonlySet<string>; status: "loading" | "ready" | "error" } | null>(null);
  useEffect(() => {
    if (!request) { setState(null); return; }
    const { snapshot, candidates, directory, registry, query, i18n } = request;
    const controller = new AbortController();
    const ids = new Set<string>();
    const publish = (status: "loading" | "ready" | "error") => {
      if (!controller.signal.aborted) setState({ request, ids: new Set(ids), status });
    };
    publish("loading");
    void (async () => {
      for (let offset = 0; offset < candidates.length; offset += 128) {
        const page = candidates.slice(offset, offset + 128);
        const records = await snapshot.records.all({ scope: "session", ids: page.map(node => node.id) }, { signal: controller.signal });
        const byId = new Map(records.map(record => [record.id, record]));
        for (const info of page) {
          const entry = historyEntry(info, byId.get(info.id) ?? null, directory, registry);
          const text = `${entry.label} ${entry.resource?.title ?? i18n.text(commonMessages.workbench)} ${entry.resource ? i18n.text(registry.resource(entry.resource.kind).label) : ""}`;
          if (text.toLocaleLowerCase(i18n.locale).includes(query)) ids.add(info.id);
        }
        publish("loading");
      }
      publish("ready");
    })().catch(error => { if (!controller.signal.aborted) { console.error("History search failed.", error); publish("error"); } });
    return () => controller.abort();
  }, [request]);
  const current = state?.request === request ? state : null;
  return { ids: current?.ids ?? emptyMatches, pending: !!query && (!current || current.status === "loading"),
    failed: current?.status === "error", retry: () => retry(value => value + 1) };
}
