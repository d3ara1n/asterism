import { useEffect, useSyncExternalStore } from "react";
import { useIsPresent } from "motion/react";
import { FileTree, type FileTreeDirectoryHandle } from "@pierre/trees";
import { useRendererCalls, useRendererObject, type RendererObjectContext } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import { failureDisplay } from "@asterism-app/ui/error-display";
import type { DirectoryWatchEvent, GitSummary } from "./contract.ts";
import { sameChanges } from "./changes-model.ts";
import { ChangesTree } from "./changes-tree.ts";
import { filesystemMessages as messages } from "../messages/filesystem.ts";
import { childPath, diffPaths, filterPaths, isKnownMissing, loadedPaths, parentOf, type TreeEntry } from "./tree-model.ts";

type Calls = ReturnType<typeof useRendererCalls>;
type TreeWatch = { refresh(): void; close(): void };

/** Resource implementations supply one-level reads and, optionally, git state. Paths use '.' for the root. */
export interface TreeSource {
  children(path: string, signal: AbortSignal): Promise<{ entries: TreeEntry[] }>;
  watch?(receive: (event: DirectoryWatchEvent) => void): TreeWatch;
}

export interface TreeState {
  /** The first root read is in progress. */
  loading: boolean;
  mode: "files" | "changes";
  git: GitSummary | null | undefined;
  gitRefreshing: boolean;
  gitFailure: UiText | null;
  watchFailure: UiText | null;
  changeNoMatches: boolean;
  refreshing: boolean;
  /** Root read failure; the tree has no content. */
  error: UiText | null;
  /** Subdirectory read failure; loaded content stays visible. */
  failure: UiText | null;
  empty: boolean;
  noMatches: boolean;
  query: string;
  changes: { added: number; removed: number } | null;
}

/** Whether `path` is reachable through loaded directory listings in `children`. */
function listedIn(children: ReadonlyMap<string, readonly TreeEntry[]>, path: string): boolean {
  if (path === "") return true;
  const parent = parentOf(path);
  return (children.get(parent)?.some(entry => childPath(parent, entry) === path) ?? false) && listedIn(children, parent);
}
const depth = (path: string) => path.split("/").length;

/**
 * Card tree state: directories load when first expanded, refresh re-reads loaded directories, and the filter
 * hides non-matching loaded paths. The model receives incremental operations, so expansion, selection and
 * scroll position survive refreshes. Expansion intent is kept here because filtered paths leave the model.
 */
export class TreeStore {
  readonly model = new FileTree({ paths: [], initialExpansion: "closed", itemHeight: 28, icons: { set: "complete", colored: false } });
  readonly changeTree: ChangesTree | undefined;
  private readonly gitRefreshListeners = new Set<() => void>();
  private users = 0;
  private disposed = false;
  private watch: TreeWatch | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private invalidated = new Set<string>();
  /** null queues a full listing read, independent of addressed watcher invalidations. */
  private queuedListings: Set<string> | null = new Set();
  private state: TreeState = {
    mode: "files", query: "", git: undefined, gitRefreshing: false, gitFailure: null, changes: null,
    loading: true, refreshing: false, error: null, failure: null, watchFailure: null,
    empty: false, noMatches: false, changeNoMatches: false,
  };
  private children = new Map<string, readonly TreeEntry[]>();
  /** Directories the user left expanded, including ones currently hidden by the filter or a collapsed ancestor. */
  private readonly expanded = new Set<string>();
  /** Directories whose ancestors are all expanded in the model, as of the last observation. */
  private readonly rendered = new Set<string>();
  private readonly pending = new Set<string>();
  private failed = new Set<string>();
  private visible: string[] = [];
  private applying = false;
  private controller: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private source: TreeSource | undefined;

  constructor(source: TreeSource) {
    this.source = source;
    this.changeTree = source.watch ? new ChangesTree() : undefined;
    this.unsubscribe = this.model.subscribe(() => this.observe());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getState = () => this.state;
  onGitRefresh(listener: () => void) { this.gitRefreshListeners.add(listener); return () => { this.gitRefreshListeners.delete(listener); }; }
  setMode(mode: TreeState["mode"]) {
    if (this.state.mode === mode) return;
    this.setState({ mode });
    if (mode === "files") void this.refreshFiles();
  }

  /** The header, body and diff share a view channel. Only snapshots survive the last consumer. */
  acquire(source: TreeSource | undefined = this.source) {
    if (this.disposed || !source) return () => {};
    this.source = source;
    this.users++;
    if (!this.controller) {
      this.controller = new AbortController();
      const { signal } = this.controller;
      this.watch = source.watch?.(event => { if (!signal.aborted) this.receive(event); });
      void this.refreshFiles();
    }
    return () => {
      if (--this.users > 0) return;
      // Moving a card into an island can synchronously replace its mounted consumers.
      queueMicrotask(() => { if (this.users === 0 && !this.disposed) this.pause(); });
    };
  }

  private receive(event: DirectoryWatchEvent) {
    switch (event.type) {
      case "filesChanged": this.requestListings(event.parents); return;
      case "watchReady": this.setState({ watchFailure: null }); return;
      case "watchError": this.setState({ watchFailure: messages.directoryWatchFailed }); return;
      case "gitReading": this.setState({ gitRefreshing: true }); return;
      case "gitError": this.setState({ gitRefreshing: false, gitFailure: messages.directoryStatusFailed }); break;
      case "gitStatus": {
        const summary = event.summary;
        const files = summary?.files ?? [];
        if (!sameChanges(this.state.git?.files ?? [], files)) {
          this.changeTree?.update(files);
          this.model.setGitStatus(files);
        }
        const changes = summary && (summary.added > 0 || summary.removed > 0) ? { added: summary.added, removed: summary.removed } : null;
        this.setState({ git: summary, gitRefreshing: false, gitFailure: null, changes });
        this.updateChangeFilter();
        break;
      }
    }
    // An open file diff can change even while the snapshot's status and line totals don't.
    for (const listener of this.gitRefreshListeners) listener();
  }

  private requestListings(parents: readonly string[]) {
    if (this.state.mode === "changes") return;
    for (const parent of parents) this.invalidated.add(parent);
    if (this.timer === undefined) this.timer = setTimeout(() => {
      this.timer = undefined;
      const paths = this.invalidated;
      this.invalidated = new Set();
      void this.refreshFiles(paths);
    }, 1000);
  }

  private pause() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.watch?.close();
    this.watch = undefined;
    this.source = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.invalidated.clear();
    this.queuedListings = new Set();
    this.children.clear();
    this.pending.clear();
    this.failed.clear();
    this.rendered.clear();
    this.applying = true;
    try {
      this.model.resetPaths([]);
      this.model.setGitStatus(this.state.git?.files ?? []);
    } finally { this.applying = false; }
    this.visible = [];
    this.setState({ loading: true, refreshing: false, gitRefreshing: false, gitFailure: null, error: null, failure: null,
      watchFailure: null, empty: false, noMatches: false });
  }

  setFilter(query: string) {
    this.setState({ query });
    this.sync();
    this.updateChangeFilter();
  }

  /** Explicit refresh invalidates both lanes, even if the native watcher has failed. */
  refresh(): Promise<void> {
    this.watch?.refresh();
    return this.refreshFiles();
  }

  private async refreshFiles(parents?: ReadonlySet<string>) {
    const source = this.source;
    if (!this.controller || !source) return;
    if (this.state.refreshing) {
      if (!parents) this.queuedListings = null;
      else if (this.queuedListings) for (const path of parents) this.queuedListings.add(path);
      return;
    }
    const paths = parents ? [...parents].filter(path => !path || this.children.has(path) || this.pending.has(path) || this.failed.has(path))
      : [...new Set(["", ...this.children.keys(), ...this.pending, ...this.failed])];
    if (!paths.length) return;
    paths.sort((a, b) => depth(a) - depth(b));
    this.setState({ refreshing: true });
    const { signal } = this.controller;
    const results = await Promise.allSettled(paths.map(path => source.children(path || ".", signal)));
    if (signal.aborted) return;
    const next = new Map(this.children);
    const failed = new Set(this.failed);
    let { error, failure } = this.state;
    if (!parents) failure = null;
    paths.forEach((path, index) => {
      if (!listedIn(next, path)) return;
      const result = results[index]!;
      if (result.status === "fulfilled") {
        next.set(path, result.value.entries);
        failed.delete(path);
        if (!path) error = null;
      } else {
        next.delete(path);
        if (!path) error = failureDisplay(result.reason, messages.directoryReadFailed);
        else { failed.add(path); failure = failureDisplay(result.reason, messages.directoryReadFailed); }
      }
    });
    // A parent listing can remove an entire cached subtree even if its children weren't reread.
    for (const path of next.keys()) if (!listedIn(next, path)) next.delete(path);
    for (const path of failed) if (!listedIn(next, path)) failed.delete(path);
    this.children = next;
    this.failed = failed;
    this.setState({ loading: false, refreshing: false, error, failure: failed.size ? failure : null });
    this.sync();
    const queued = this.queuedListings;
    this.queuedListings = new Set();
    if (queued === null) void this.refreshFiles();
    else if (queued.size) void this.refreshFiles(queued);
  }

  private updateChangeFilter() {
    this.setState({ changeNoMatches: this.changeTree?.filter(this.state.query) ?? false });
  }

  dispose() {
    this.disposed = true;
    this.pause();
    this.unsubscribe();
    this.model.cleanUp();
    this.changeTree?.dispose();
    this.gitRefreshListeners.clear();
    this.listeners.clear();
  }

  private setState(patch: Partial<TreeState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Apply loaded listings and the filter to the model as incremental operations. */
  private sync() {
    const listed = loadedPaths(this.children);
    const next = filterPaths(listed, this.state.query);
    const operations = diffPaths(this.visible, next);
    if (operations.length > 0) {
      this.applying = true;
      try { this.model.batch(operations); } finally { this.applying = false; }
    }
    this.visible = next;
    const shown = new Set(next);
    for (const path of this.rendered) if (!shown.has(path)) this.rendered.delete(path);
    for (const path of this.expanded) if (isKnownMissing(this.children, path)) this.expanded.delete(path);
    const rootLoaded = this.children.has("");
    this.setState({
      empty: rootLoaded && listed.length === 0,
      noMatches: listed.length > 0 && next.length === 0,
    });
    this.observe();
  }

  private directory(path: string): FileTreeDirectoryHandle | null {
    const item = this.model.getItem(path);
    return item?.isDirectory() ? item as FileTreeDirectoryHandle : null;
  }
  private isOpen(path: string): boolean { return this.directory(path)?.isExpanded() ?? false; }

  /**
   * Reconcile model expansion with intent. A directory that stayed rendered reports user toggles;
   * a directory that just became rendered (added, revealed, or uncovered by its parent) takes the stored intent.
   */
  private observe() {
    if (this.applying || !this.controller) return;
    this.applying = true;
    try {
      for (const path of this.visible) {
        if (!path.endsWith("/")) continue;
        const parent = parentOf(path);
        if (parent !== "" && !(this.rendered.has(parent) && this.isOpen(parent))) { this.rendered.delete(path); continue; }
        const open = this.isOpen(path);
        if (this.rendered.has(path)) {
          if (open) this.expanded.add(path);
          else if (this.expanded.delete(path)) this.failed.delete(path);
        } else {
          const item = this.directory(path);
          if (item && open !== this.expanded.has(path)) {
            if (open) item.collapse(); else item.expand();
          }
          this.rendered.add(path);
        }
      }
    } finally { this.applying = false; }
    if (this.state.mode === "files") {
      for (const path of this.rendered) {
        if (this.expanded.has(path) && !this.children.has(path) && !this.pending.has(path) && !this.failed.has(path)) void this.load(path);
      }
    }
  }

  private async load(path: string) {
    const source = this.source;
    if (!this.controller || !source) return;
    const { signal } = this.controller;
    this.pending.add(path);
    let entries: TreeEntry[];
    try { entries = (await source.children(path, signal)).entries; }
    catch (error) {
      if (signal.aborted) return;
      this.failed.add(path);
      this.setState({ failure: failureDisplay(error, messages.directoryReadFailed) });
      return;
    } finally { if (!signal.aborted) this.pending.delete(path); }
    if (signal.aborted || this.children.has(path) || !listedIn(this.children, path)) return;
    this.children.set(path, entries);
    this.sync();
  }
}

// Keep the retained disposer outside the hook's object and session closure scope.
const disposeTreeStore = (store: TreeStore) => store.dispose();

/** Retained UI intent survives session switches; effects own active reads and native subscriptions. */
export function useTreeStore(key: string, createSource: (calls: Calls, ref: ResourceRef, object: RendererObjectContext) => TreeSource) {
  const object = useRendererObject();
  const calls = useRendererCalls();
  const store = object.retained.get(key, () => new TreeStore(createSource(calls, object.ref, object)), disposeTreeStore);
  const present = useIsPresent();
  useEffect(() => present ? store.acquire(createSource(calls, object.ref, object)) : undefined,
    [present, store, calls, object.ref.sessionId, object.ref.id, object.ref.kind, object.openChannel]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state };
}
