import { useEffect, useSyncExternalStore } from "react";
import { useRendererCalls, useRendererObject } from "@atelier/sdk/renderer";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { DirectoryTree } from "./contract.ts";

export interface TreeData {
  paths: string[];
  gitStatus: Array<{ path: string; status: string }>;
  hasGit: boolean;
}
export interface TreeLinkState {
  loading: boolean;
  data: TreeData | null;
  error: string | null;
}

type Calls = ReturnType<typeof useRendererCalls>;
const key = (ref: ResourceRef) => `${ref.sessionId}\n${ref.id}`;

/** Actions 与 Body 共享同一棵树的加载状态；引用计数归零时取消并从 map 移除。 */
class DirectoryTreeLink {
  state: TreeLinkState = { loading: true, data: null, error: null };
  private controller = new AbortController();
  private readonly listeners = new Set<() => void>();
  private users = 0;

  constructor(
    private readonly calls: Calls,
    private readonly ref: ResourceRef,
    private readonly released: () => void,
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
    void this.calls.invoke(DirectoryTree, {}, { object: this.ref, signal })
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

const links = new Map<string, DirectoryTreeLink>();

function ensureLink(calls: Calls, ref: ResourceRef): DirectoryTreeLink {
  const id = key(ref);
  let link = links.get(id);
  if (!link) {
    const created = new DirectoryTreeLink(calls, ref, () => { if (links.get(id) === created) links.delete(id); });
    links.set(id, created);
    link = created;
  }
  return link;
}

export function useDirectoryTreeLink() {
  const object = useRendererObject();
  const calls = useRendererCalls();
  const link = ensureLink(calls, object.ref);
  useEffect(() => { link.acquire(); return () => link.release(); }, [link]);
  const state = useSyncExternalStore(link.subscribe, link.getState);
  return { link, state };
}
