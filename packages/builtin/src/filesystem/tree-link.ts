import { useEffect, useSyncExternalStore } from "react";
import { useRendererCalls, useRendererObject } from "@asterism-app/sdk/renderer";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { DirectoryTree } from "./contract.ts";

export interface TreeData {
  paths: string[];
  gitStatus?: Array<{ path: string; status: string }>;
}
export interface TreeLinkState {
  loading: boolean;
  data: TreeData | null;
  error: string | null;
}

type Calls = ReturnType<typeof useRendererCalls>;
type LoadTree = (calls: Calls, ref: ResourceRef, signal: AbortSignal) => Promise<TreeData>;
const key = (ref: ResourceRef) => `${ref.sessionId}\n${ref.id}`;

/** Actions and Body share loading state for the same tree; when the reference count reaches zero, cancel and remove it from the map. */
class TreeLink {
  state: TreeLinkState = { loading: true, data: null, error: null };
  private controller = new AbortController();
  private readonly listeners = new Set<() => void>();
  private users = 0;

  constructor(
    private readonly calls: Calls,
    private readonly ref: ResourceRef,
    private readonly released: () => void,
    private readonly load: LoadTree,
  ) { this.doLoad(); }

  private notify() { for (const l of this.listeners) l(); }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  reload() {
    this.controller.abort();
    this.controller = new AbortController();
    this.state = { ...this.state, loading: true, error: null };
    this.notify();
    this.doLoad();
  }

  private doLoad() {
    const { signal } = this.controller;
    void this.load(this.calls, this.ref, signal)
      .then(result => {
        if (signal.aborted) return;
        this.state = { loading: false, data: result, error: null };
        this.notify();
      })
      .catch(err => {
        if (signal.aborted) return;
        this.state = { ...this.state, loading: false, error: err instanceof Error ? err.message : String(err) };
        this.notify();
      });
  }

  acquire() { this.users++; }
  release() {
    if (--this.users > 0) return;
    queueMicrotask(() => { if (this.users === 0) { this.controller.abort(); this.released(); } });
  }
}

/** Each resource implementation owns its loader and shared card subscriptions. */
export function createTreeLink(load: LoadTree) {
  const links = new Map<string, TreeLink>();
  function ensureLink(calls: Calls, ref: ResourceRef): TreeLink {
    const id = key(ref);
    let link = links.get(id);
    if (!link) {
      const created = new TreeLink(calls, ref, () => { if (links.get(id) === created) links.delete(id); }, load);
      links.set(id, created);
      link = created;
    }
    return link;
  }
  return function useTreeLink() {
    const object = useRendererObject();
    const calls = useRendererCalls();
    const link = ensureLink(calls, object.ref);
    useEffect(() => { link.acquire(); return () => link.release(); }, [link]);
    const state = useSyncExternalStore(link.subscribe, link.getState);
    return { link, state };
  };
}

export const useDirectoryTreeLink = createTreeLink((calls, ref, signal) =>
  calls.invoke(DirectoryTree, {}, { object: ref, signal }));
