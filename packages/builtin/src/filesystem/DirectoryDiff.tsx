import { useIsPresent } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { IslandPanel, useI18n, useRendererCalls, useRendererEvents, useRendererIsland } from "@asterism-app/sdk/renderer";
import { ResourcePresenceChanged, type ResourceRef, type UiText } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { CodeDiff, CodeText, parseFileDiff } from "@asterism-app/ui/code-view";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { RefreshCw } from "lucide-react";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { ReadDirectoryDiff } from "./editor-contract";
import { filesystemMessages as messages } from "../messages/filesystem";
import type { TreeStore } from "./tree-store";

type DiffData = z.infer<typeof ReadDirectoryDiff.output>;
const sameDiff = (a: DiffData, b: DiffData) => a.kind === b.kind && (a.kind !== "patch" || (b.kind === "patch" && a.patch === b.patch));

/** A selected diff reloads after browser refresh, even when the status list itself did not change. */
export default function DirectoryDiff({ resource, path, store }: { resource: ResourceRef; path: string; store: TreeStore }) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const events = useRendererEvents();
  const island = useRendererIsland();
  const present = useIsPresent();
  useEffect(() => present ? store.acquire() : undefined, [present, store]);
  useEffect(() => {
    const subscription = events.subscribe(ResourcePresenceChanged, {}, event => {
      if (event.data.sessionId === resource.sessionId && event.data.disappeared.includes(resource.id)) void island.close({ force: true });
    });
    return () => subscription.close();
  }, [events, island, resource.sessionId, resource.id]);
  const [data, setData] = useState<DiffData | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!present) return;
    let controller: AbortController;
    // Store refreshes reread in the background; an unchanged result keeps the current object and its parsed diff.
    const read = (background: boolean) => {
      controller?.abort(); controller = new AbortController();
      const { signal } = controller;
      if (!background) { setLoading(true); setError(null); }
      void calls.invoke(ReadDirectoryDiff, { path }, { object: resource, signal }).then(value => {
        if (signal.aborted) return;
        setData(previous => previous && sameDiff(previous, value) ? previous : value);
        setError(null); setLoading(false);
      }, failure => {
        if (!signal.aborted) { setError(failureDisplay(failure, messages.diffFailed)); setLoading(false); }
      });
    };
    read(false);
    const unsubscribe = store.onRefresh(() => read(true));
    return () => { unsubscribe(); controller.abort(); };
  }, [present, calls, resource, path, store, attempt]);
  const parsed = useMemo(() => data?.kind === "patch" ? parseFileDiff(data.patch) : null, [data]);
  return <IslandPanel title={path} description={i18n.text(messages.diffBase)} action={
    <IconButton label={i18n.text(messages.directoryRefresh)} disabled={loading} onClick={() => setAttempt(value => value + 1)}>
      {loading ? <Spinner /> : <RefreshCw />}
    </IconButton>}>
    {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
    {data?.kind === "patch" ? parsed?.hunks.length === 0
      ? <CodeText contents={data.patch} language="diff" /> : <CodeDiff diff={parsed ?? data.patch} />
      : data ? <p className="type-caption text-muted-foreground">{i18n.text(data.kind === "binary" ? messages.diffBinary : messages.diffEmpty)}</p>
      : loading ? <Spinner /> : null}
  </IslandPanel>;
}
