import type { Decoded, Json, RecordContract, RecordQuery, SessionRecord, RecordInfo } from "@asterism-app/sdk/contracts";
import type { RendererSessionSnapshot, RecordReadOptions } from "@asterism-app/sdk/renderer";
import type { SessionBridge, SessionData, SessionNode, SessionNodeInfo } from "../../../shared/session";
import { applySessionNodes, sessionTimeline } from "../../../shared/session-timeline";
import { nodeInfo } from "../../../session/view";
import { selectNodes, contractQuery } from "../../../session/query";
import { toRecord, toRecordInfo, recordNode, snapshotResources } from "../../../plugins/records";
import { foldWorkbench, workbenchRecordIds } from "../../../session/fold";

interface Read {
  info: SessionNodeInfo;
  resolve(record: SessionRecord): void;
  reject(error: unknown): void;
}
const readBatchSize = 128;
type RecordState = Pick<SessionData, "nodes" | "pending">;
type SnapshotState = Pick<SessionData, "sessionId" | "title" | "cursor" | "nodes" | "pending">;

/** A session owns identity sharing; readers own strong body references, so unused pages can be collected. */
export class SessionRecordStore {
  private readonly bodies = new Map<string, WeakRef<SessionRecord>>();
  private readonly infos = new WeakMap<SessionNodeInfo, RecordInfo>();
  private readonly pendingBodies = new WeakMap<SessionNode, SessionRecord>();
  private readonly pending = new Map<string, Promise<SessionRecord>>();
  private observation: { state: SnapshotState; snapshot: RendererSessionSnapshot } | null = null;
  private queued: Read[] = [];
  constructor(private readonly bridge: SessionBridge, private readonly sessionId: string) {}

  /** Append and completion belong to one record update; completed bodies replace pending observations in the new state only. */
  apply(current: RecordState, appended: readonly SessionNode[], completed: readonly SessionNode[] = []): RecordState {
    if (!appended.length && !completed.length) return current;
    const added = appended.map((node, index) => nodeInfo(node, current.nodes.length + index + 1));
    const positions = new Map([...current.nodes, ...added].map(node => [node.id, node.sequence]));
    const replaced = completed.map(node => nodeInfo(node, positions.get(node.id)!));
    const pending = new Map(current.pending.map(node => [node.id, node]));
    for (const node of [...appended, ...completed]) {
      if (node.pending) pending.set(node.id, node);
      else pending.delete(node.id);
      this.remember(node, positions.get(node.id)!);
    }
    return { nodes: applySessionNodes(current.nodes, added, replaced), pending: [...pending.values()] };
  }

  /** Views of the same observation share one snapshot; layout and object presentation updates leave it intact. */
  snapshot(data: SnapshotState): RendererSessionSnapshot {
    const { sessionId, title, cursor, nodes, pending } = data;
    const previous = this.observation;
    if (previous && previous.state.sessionId === sessionId && previous.state.title === title && previous.state.cursor === cursor
      && previous.state.nodes === nodes && previous.state.pending === pending) return previous.snapshot;
    const state = { sessionId, title, cursor, nodes, pending };
    const snapshot = this.captureSnapshot(state);
    this.observation = { state, snapshot };
    return snapshot;
  }

  private remember(node: SessionNode, sequence: number): SessionRecord {
    // Pending bodies are fixed observations and never share the finalized body's cache entry.
    if (node.pending) {
      let captured = this.pendingBodies.get(node);
      if (!captured) { captured = toRecord(node, sequence); this.pendingBodies.set(node, captured); }
      return captured;
    }
    const known = this.bodies.get(node.id)?.deref();
    if (known) return known;
    const record = toRecord(node, sequence);
    this.bodies.set(node.id, new WeakRef(record));
    return record;
  }

  private read(info: SessionNodeInfo): Promise<SessionRecord> {
    const known = this.bodies.get(info.id)?.deref();
    if (known) return Promise.resolve(known);
    let pending = this.pending.get(info.id);
    if (!pending) {
      pending = new Promise<SessionRecord>((resolve, reject) => {
        if (!this.queued.length) queueMicrotask(() => this.flush());
        this.queued.push({ info, resolve, reject });
      }).finally(() => { this.pending.delete(info.id); });
      this.pending.set(info.id, pending);
    }
    return pending;
  }

  /** Coalesce independent readers in the same turn before crossing the process boundary. */
  private flush(): void {
    const queued = this.queued; this.queued = [];
    for (let offset = 0; offset < queued.length; offset += readBatchSize) {
      const page = queued.slice(offset, offset + readBatchSize);
      void this.bridge.execute({ type: "records.read", sessionId: this.sessionId, ids: page.map(read => read.info.id) }).then(result => {
        if (!result.ok) throw new Error(result.error.message);
        if (result.reply.kind !== "records") throw new Error("The record read returned an unexpected reply.");
        const nodes = new Map(result.reply.nodes.map(node => [node.id, node]));
        for (const read of page) {
          const node = nodes.get(read.info.id);
          if (!node) { read.reject(new Error("A selected record was not returned.")); continue; }
          read.resolve(this.remember(node, read.info.sequence));
        }
      }).catch(error => { for (const read of page) read.reject(error); });
    }
  }

  private captureSnapshot(data: SnapshotState): RendererSessionSnapshot {
    const { sessionId, title, cursor, nodes, pending: capturedPending } = data;
    const timeline = sessionTimeline(nodes, cursor);
    const byId = new Map(nodes.map(info => [info.id, info]));
    const timelineIds = new Set(timeline.map(info => info.id));
    const pending = new Map(capturedPending.map(node => [node.id, this.remember(node, byId.get(node.id)!.sequence)]));
    const infos = new Map(nodes.map(info => {
      let value = this.infos.get(info);
      if (!value) { value = toRecordInfo(info); this.infos.set(info, value); }
      return [info.id, value];
    }));
    const select = (query: RecordQuery) => {
      if (query.ids && query.from === undefined && query.before === undefined) {
        const candidates = [...new Set(query.ids)].flatMap(id => {
          const info = byId.get(id);
          return info && (query.scope === "session" || timelineIds.has(id)) ? [info] : [];
        }).sort((a, b) => a.sequence - b.sequence);
        return selectNodes(candidates, query);
      }
      return selectNodes(query.scope === "session" ? nodes : timeline, query);
    };
    const all = async (query: RecordQuery, options?: RecordReadOptions): Promise<readonly SessionRecord[]> => {
      options?.signal?.throwIfAborted();
      const selected = select(query), result: SessionRecord[] = [];
      for (let offset = 0; offset < selected.length; offset += readBatchSize) {
        result.push(...await Promise.all(selected.slice(offset, offset + readBatchSize).map(info => pending.get(info.id) ?? this.read(info))));
        options?.signal?.throwIfAborted();
      }
      return Object.freeze(result);
    };
    const lookup = async <D extends Json>(contract: RecordContract<D>, query: RecordQuery, edge: "first" | "last", options?: RecordReadOptions): Promise<Decoded<D> | null> => {
      const records = await all(contractQuery(query, contract, edge), options);
      return records[0] ? contract.decode(records[0]) : null;
    };
    const resources = async (options?: RecordReadOptions) => {
      const records = await all({ scope: "timeline", contracts: workbenchRecordIds }, options);
      const workbench = foldWorkbench(records.map(recordNode));
      return snapshotResources(sessionId, () => workbench);
    };
    return { id: sessionId, title, position: Object.freeze({ nodeId: cursor }),
      resources: {
        all: async options => (await resources(options)).all(),
        linkedTo: async (receiver, options) => (await resources(options)).linkedTo(receiver),
        get: async (contract, id, options) => (await resources(options)).get(contract, id),
      }, records: {
        index: query => Object.freeze(select(query).map(info => infos.get(info.id)!)),
        all,
        query: async (contract, query, options) => contract.decodeAll(await all(contractQuery(query, contract), options)),
        first: (contract, query, options) => lookup(contract, query, "first", options),
        last: (contract, query, options) => lookup(contract, query, "last", options),
      } };
  }
}
