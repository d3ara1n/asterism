import { useEffect, useSyncExternalStore } from "react";
import { useIsPresent } from "motion/react";
import { FileTree, type FileTreeDirectoryHandle } from "@pierre/trees";
import type { z } from "zod";
import { useRendererCalls, useRendererObject, type RendererObjectContext } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import { failureDisplay } from "@asterism-app/ui/error-display";
import type { DirectoryStatus, DirectoryWatchEvent } from "./contract.ts";
import { sameChanges } from "./changes-model.ts";
import { ChangesTree } from "./changes-tree.ts";
import { filesystemMessages as messages } from "../messages/filesystem.ts";
import { childPath, diffPaths, filterPaths, loadedPaths, parentOf, type TreeEntry } from "./tree-model.ts";

type Calls = ReturnType<typeof useRendererCalls>;
type StatusData = z.infer<typeof DirectoryStatus.output>;

/** Resource implementations supply one-level reads and, optionally, git state. Paths use '.' for the root. */
export interface TreeSource {
  children(path: string, signal: AbortSignal): Promise<{ entries: TreeEntry[] }>;
  status?(signal: AbortSignal): Promise<StatusData>;
  watch?(receive: (event: DirectoryWatchEvent) => void): () => void;
}

export interface TreeState {
  /** The first root read is in progress. */
  loading: boolean;
  mode: "files" | "changes";
  git: StatusData | undefined;
  watchFailure: UiText | null;
  changeNoMatches: boolean;
  refreshing: boolean;
  /** Root read failure; the tree has no content. */
  error: UiText | null;
  /** Subdirectory or git status read failure; loaded content stays visible. */
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
  private readonly refreshListeners = new Set<() => void>();
  private users = 0;
  private disposed = false;
  private stopWatch: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private refreshPending = false;
  private state: TreeState = {
    mode: "files", query: "", git: undefined, changes: null,
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
    this.changeTree = source.status ? new ChangesTree() : undefined;
    this.unsubscribe = this.model.subscribe(() => this.observe());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getState = () => this.state;
  onRefresh(listener: () => void) { this.refreshListeners.add(listener); return () => { this.refreshListeners.delete(listener); }; }
  setMode(mode: TreeState["mode"]) {
    if (this.state.mode === mode) return;
    this.setState({ mode });
    if (mode === "files") void this.refresh();
  }

  /** Mounted card consumers share one watch. Retention preserves intent, not background work. */
  acquire(source: TreeSource | undefined = this.source) {
    if (this.disposed || !source) return () => {};
    this.source = source;
    this.users++;
    if (!this.controller) {
      this.controller = new AbortController();
      if (source.watch) {
        this.stopWatch = source.watch(event => {
          if (!this.controller) return;
          if (event.type === "ready") void this.refresh();
          else if (event.type === "changed") this.requestRefresh();
          else {
            this.setState({ watchFailure: messages.directoryWatchFailed });
            if (this.state.loading) void this.refresh();
          }
        });
      } else void this.refresh();
    }
    return () => {
      if (--this.users > 0) return;
      // Moving a card into an island can synchronously replace its mounted consumers.
      queueMicrotask(() => { if (this.users === 0 && !this.disposed) this.pause(); });
    };
  }

  /** Invalidations coalesce into one refresh at most a second after the first, so sustained writes still show progress. */
  requestRefresh() {
    if (!this.controller || this.timer !== undefined) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh(); }, 1000);
  }

  private pause() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.stopWatch?.();
    this.stopWatch = undefined;
    this.source = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.refreshPending = false;
    this.children.clear();
    this.pending.clear();
    this.failed.clear();
    this.rendered.clear();
    this.applying = true;
    try {
      this.model.resetPaths([]);
      this.model.setGitStatus([]);
    } finally { this.applying = false; }
    this.changeTree?.clear();
    this.visible = [];
    this.setState({ loading: true, refreshing: false, git: undefined, changes: null, error: null, failure: null,
      watchFailure: null, empty: false, noMatches: false, changeNoMatches: false });
  }

  setFilter(query: string) {
    this.setState({ query });
    this.sync();
    this.updateChangeFilter();
  }

  /** Refresh Git and, while Files is active, loaded directories; vanished directories drop their subtrees. */
  async refresh() {
    const source = this.source;
    if (!this.controller || !source) return;
    if (this.state.refreshing) { this.refreshPending = true; return; }
    this.setState({ refreshing: true });
    const { signal } = this.controller;
    const directories = this.state.mode === "changes" ? []
      : ["", ...this.children.keys()].filter((path, index, all) => all.indexOf(path) === index)
        .sort((a, b) => depth(a) - depth(b));
    const [status, ...results] = await Promise.allSettled([
      source.status?.(signal) ?? Promise.resolve(null),
      ...directories.map(path => source.children(path || ".", signal)),
    ]);
    if (signal.aborted) return;
    const next = directories.length ? new Map<string, readonly TreeEntry[]>() : new Map(this.children);
    const failed = new Set<string>();
    let error: UiText | null = null, failure: UiText | null = null;
    directories.forEach((path, index) => {
      if (!listedIn(next, path)) return;
      const result = results[index]!;
      if (result.status === "fulfilled") next.set(path, result.value.entries);
      else if (path === "") error = failureDisplay(result.reason, messages.directoryReadFailed);
      else { failed.add(path); failure = failureDisplay(result.reason, messages.directoryReadFailed); }
    });
    // Directories expanded while this refresh was reading are current reads of their own.
    for (const path of [...this.children.keys()].sort((a, b) => depth(a) - depth(b)))
      if (!next.has(path) && !directories.includes(path) && listedIn(next, path)) next.set(path, this.children.get(path)!);
    let changes: TreeState["changes"] = null;
    if (status.status === "fulfilled") {
      const data = status.value;
      const files = data?.files ?? [];
      if (!sameChanges(this.state.git?.files ?? [], files)) {
        this.changeTree?.update(files);
        this.model.setGitStatus(files);
      }
      this.setState({ git: data });
      this.updateChangeFilter();
      if (data && (data.added > 0 || data.removed > 0)) changes = { added: data.added, removed: data.removed };
    } else {
      failure ??= failureDisplay(status.reason, messages.directoryStatusFailed);
    }
    this.children = next;
    this.failed = failed;
    this.setState({ loading: false, refreshing: false, error, failure, changes });
    this.sync();
    // Diff content can change while status paths and classifications stay identical.
    for (const listener of this.refreshListeners) listener();
    if (this.refreshPending) { this.refreshPending = false; void this.refresh(); }
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
    this.refreshListeners.clear();
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
    const shown = new Set(next), exists = new Set(listed);
    for (const path of this.rendered) if (!shown.has(path)) this.rendered.delete(path);
    for (const path of this.expanded) if (!exists.has(path)) this.expanded.delete(path);
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
    } finally { this.pending.delete(path); }
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
