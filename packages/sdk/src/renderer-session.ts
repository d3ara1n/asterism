import { useCallback, useEffect, useState } from "react";
import type { Decoded, RecordContract, RecordInfo, RecordQuery, SessionRecord } from "./records.ts";
import type { Json } from "./json.ts";
import type { SessionSnapshot, ResourceSnapshot, ResourceRef } from "./workspace.ts";
import type { ResourceContract } from "./module-contract.ts";
export interface RecordReadOptions { readonly signal?: AbortSignal }

/** Remote snapshots share fixed positions and metadata; body reads are explicitly asynchronous. */
export interface RendererSessionSnapshot extends Omit<SessionSnapshot, "records" | "resources"> {
  readonly resources: {
    all(options?: RecordReadOptions): Promise<readonly ResourceSnapshot[]>;
    linkedTo(receiver: ResourceRef, options?: RecordReadOptions): Promise<readonly ResourceSnapshot[]>;
    get<S extends Json>(contract: ResourceContract<S>, id: string, options?: RecordReadOptions): Promise<
      { status: "known"; resource: ResourceSnapshot<S> } | { status: "unknown"; resource: ResourceSnapshot; reason: "invalid_data" } | null>;
  };
  readonly records: {
    index(query: RecordQuery): readonly RecordInfo[];
    all(query: RecordQuery, options?: RecordReadOptions): Promise<readonly SessionRecord[]>;
    query<D extends Json>(contract: RecordContract<D>, query: RecordQuery, options?: RecordReadOptions): Promise<Decoded<D>[]>;
    first<D extends Json>(contract: RecordContract<D>, query: RecordQuery, options?: RecordReadOptions): Promise<Decoded<D> | null>;
    last<D extends Json>(contract: RecordContract<D>, query: RecordQuery, options?: RecordReadOptions): Promise<Decoded<D> | null>;
  };
}

type SessionReadState<T> =
  | { status: "loading"; data: T | null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: Error };
const loading = { status: "loading", data: null, error: null } as const;
export type SessionRead<T> = SessionReadState<T> & { retry(): void };
export interface SessionReadOptions {
  keepPrevious?: boolean;
  /** Identity of the logical query whose content may remain visible during a reread; defaults to the reader function. */
  key?: unknown;
}

/** Memoize read with useCallback. Replacing the snapshot or reader ends the old UI observation. */
export function useSessionRead<T>(snapshot: RendererSessionSnapshot | null, read: (snapshot: RendererSessionSnapshot, signal: AbortSignal) => Promise<T>,
  options: SessionReadOptions = {}): SessionRead<T> {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const key = "key" in options ? options.key : read;
  const [value, setValue] = useState<{ snapshot: RendererSessionSnapshot; read: typeof read; attempt: number; key: unknown; result: SessionReadState<T> } | null>(null);
  useEffect(() => {
    if (!snapshot) { setValue(null); return; }
    const controller = new AbortController();
    void Promise.resolve().then(() => read(snapshot, controller.signal)).then(data => {
      if (!controller.signal.aborted) setValue({ snapshot, read, attempt, key, result: { status: "ready", data, error: null } });
    }, error => {
      if (!controller.signal.aborted) setValue({ snapshot, read, attempt, key, result: { status: "error", data: null, error: error instanceof Error ? error : new Error(String(error)) } });
    });
    return () => controller.abort();
  }, [snapshot, read, attempt, key]);
  if (value?.snapshot === snapshot && value?.read === read && value.attempt === attempt && Object.is(value.key, key))
    return { ...value.result, retry };
  let data: T | null = null;
  if (options.keepPrevious && value && snapshot && Object.is(value.key, key) && value.snapshot.id === snapshot.id) {
    const tip = value.snapshot.position.nodeId;
    if (tip === null || snapshot.records.index({ scope: "timeline", ids: [tip] }).length > 0) data = value.result.data;
  }
  return { ...loading, data, retry };
}
