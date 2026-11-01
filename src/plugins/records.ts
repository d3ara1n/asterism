import type { Decoded, Json, RecordContract, RecordQuery, ResourceRef, ResourceSnapshot, SessionRecord, SessionSnapshot, SessionView, RecordInfo } from "@asterism-app/sdk/contracts";
import type { SessionNode, SessionNodeInfo } from "../shared/session.ts";
import { foldWorkbench, workbenchRecordIds, type FoldedObject } from "../session/fold.ts";
import type { NodeView } from "../session/view.ts";
import { contractQuery } from "../session/query.ts";
import { deepFreeze } from "../shared/immutable.ts";

/** Direct mapping from storage nodes to public record envelopes: contract, origin, payload, and model-visible text pass through unchanged without host interpretation. */
export function toRecord(node: SessionNode, sequence: number): SessionRecord {
  const { id, sessionId, parentId, createdAt, source, contract, data, model, recipient } = node;
  return deepFreeze({ id, sessionId, parentId, sequence, createdAt, contract: { id: contract },
    source: structuredClone(source), data: structuredClone(data), context: model === null ? null : { text: model, recipient },
    ...(node.pending === undefined ? {} : { pending: node.pending }) });
}
export function toRecordInfo(node: SessionNodeInfo): RecordInfo {
  return deepFreeze({ ...node, contract: { id: node.contract }, source: structuredClone(node.source) });
}
/** Internal projections consume the public record without cloning its immutable body. */
export function recordNode(record: SessionRecord): SessionNode {
  return { id: record.id, sessionId: record.sessionId, parentId: record.parentId, createdAt: record.createdAt,
    source: record.source, contract: record.contract.id, data: record.data,
    model: record.context?.text ?? null, recipient: record.context?.recipient ?? null,
    ...(record.pending === undefined ? {} : { pending: record.pending }) };
}
export function resourceSnapshot(ref: ResourceRef, resource: FoldedObject): ResourceSnapshot {
  return deepFreeze({ ref: { ...ref }, title: resource.title, data: structuredClone(resource.data) });
}
export function sessionSnapshot(source: NodeView): SessionSnapshot {
  const workbench = () => foldWorkbench(source.read({ scope: "timeline",
    contracts: workbenchRecordIds,
  }).map(({ node }) => node));
  return {
    ...sessionView(source), position: Object.freeze({ nodeId: source.nodeId }),
    resources: snapshotResources(source.id, workbench),
  };
}
export function snapshotResources(sessionId: string, workbench: () => ReturnType<typeof foldWorkbench>): SessionSnapshot["resources"] {
  const snapshot = (object: FoldedObject) => resourceSnapshot({ sessionId, id: object.id, kind: object.kind }, object);
  return {
    all: () => Object.freeze(workbench().objects.map(snapshot)),
    linkedTo(receiver) {
      if (receiver.sessionId !== sessionId) return Object.freeze([]);
      const { objects, links } = workbench();
      if (!objects.some(object => object.id === receiver.id && object.kind === receiver.kind)) return Object.freeze([]);
      const linked = new Set(links.filter(link => link.receiverId === receiver.id).map(link => link.resourceId));
      return Object.freeze(objects.filter(object => linked.has(object.id)).map(snapshot));
    },
    get(contract, objectId) {
      const object = workbench().objects.find(object => object.id === objectId && object.kind === contract.kind);
      if (!object) return null;
      const resource = snapshot(object);
      const parsed = contract.stateSchema.safeParse(resource.data);
      return parsed.success
        ? { status: "known", resource: { ...resource, data: parsed.data } }
        : { status: "unknown", resource, reason: "invalid_data" };
    },
  };
}
/**
 * Snapshots hold only fixed-position read handles; each query maps and decodes only selected records.
 * Positions and captured bodies are fixed and records deeply frozen; identical `all` queries within a snapshot reuse results without copying full history.
 */
export function sessionView(source: NodeView): SessionView {
  const cache = new Map<string, readonly SessionRecord[]>();
  const recordsById = new Map<string, SessionRecord>();
  const record = ({ node, sequence }: ReturnType<NodeView["read"]>[number]) => {
    let value = recordsById.get(node.id);
    if (!value) { value = toRecord(node, sequence); recordsById.set(node.id, value); }
    return value;
  };
  const read = (query: RecordQuery) => {
    const key = JSON.stringify(query);
    let records = cache.get(key);
    if (!records) {
      const selected = source.index(query);
      const missing = selected.filter(info => !recordsById.has(info.id));
      if (missing.length) for (const entry of source.read({ scope: query.scope, ids: missing.map(info => info.id) })) record(entry);
      cache.set(key, records = Object.freeze(selected.map(info => recordsById.get(info.id)!)));
    }
    return records;
  };
  const query = <D extends Json>(contract: RecordContract<D>, q: RecordQuery) =>
    contract.decodeAll(read(contractQuery(q, contract)));
  const lookup = <D extends Json>(contract: RecordContract<D>, q: RecordQuery, edge: "first" | "last"): Decoded<D> | null => {
    const entry = read(contractQuery(q, contract, edge))[0];
    return entry ? contract.decode(entry) : null;
  };
  return { id: source.id, title: source.title, records: { all: read, query,
    index: query => Object.freeze(source.index(query).map(toRecordInfo)),
    first: (contract, q) => lookup(contract, q, "first"),
    last: (contract, q) => lookup(contract, q, "last"),
  } };
}
