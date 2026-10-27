import type { Decoded, Json, RecordContract, RecordQuery, ResourceRef, ResourceSnapshot, SessionRecord, SessionSnapshot, SessionView } from "@asterism/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import type { NodeView } from "../session/view.ts";
import { deepFreeze } from "../shared/immutable.ts";

/** Direct mapping from storage nodes to public record envelopes: contract, origin, payload, and model-visible text pass through unchanged without host interpretation. */
export function toRecord(node: SessionNode, sequence: number): SessionRecord {
  const { id, sessionId, parentId, createdAt, source, contract, data, model, recipient } = node;
  return deepFreeze({ id, sessionId, parentId, sequence, createdAt, contract: { id: contract },
    source: structuredClone(source), data: structuredClone(data), context: model === null ? null : { text: model, recipient } });
}
export function resourceSnapshot(ref: ResourceRef, resource: FoldedObject): ResourceSnapshot {
  const { id: _id, type: _type, title: _title, ...data } = resource.data;
  return deepFreeze({ ref: { ...ref }, title: resource.title, data: structuredClone(data) as Json });
}
export function sessionSnapshot(source: NodeView): SessionSnapshot {
  const workbench = () => foldWorkbench(source.read({ scope: "timeline",
    contracts: ["resource_created", "resource_renamed", "object_removed", "resource_attached", "resource_detached"],
  }).map(({ node }) => node));
  const snapshot = (object: FoldedObject) => resourceSnapshot({ sessionId: source.id, id: object.id, kind: object.kind }, object);
  return {
    ...sessionView(source), position: Object.freeze({ nodeId: source.nodeId }),
    resources: {
      all: () => Object.freeze(workbench().objects.map(snapshot)),
      linkedTo(receiver) {
        if (receiver.sessionId !== source.id) return Object.freeze([]);
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
    },
  };
}
/**
 * Snapshots hold only fixed-position read handles; each query maps and decodes only selected records.
 * Positions and nodes are immutable and records deeply frozen; identical `all` queries within a snapshot reuse results without copying full history for each projection.
 */
export function sessionView(source: NodeView): SessionView {
  const cache = new Map<RecordQuery["scope"], readonly SessionRecord[]>();
  const all = ({ scope }: RecordQuery) => {
    let records = cache.get(scope);
    if (!records) cache.set(scope, records = Object.freeze(source.read({ scope }).map(({ node, sequence }) => toRecord(node, sequence))));
    return records;
  };
  const query = <D extends Json>(contract: RecordContract<D>, q: RecordQuery) =>
    source.read({ ...q, contracts: [contract.id] }).flatMap(({ node, sequence }) => {
      const decoded = contract.decode(toRecord(node, sequence));
      return decoded ? [decoded] : [];
    });
  const lookup = <D extends Json>(contract: RecordContract<D>, q: RecordQuery, edge: "first" | "last"): Decoded<D> | null => {
    const entry = source.read({ ...q, contracts: [contract.id], edge })[0];
    return entry ? contract.decode(toRecord(entry.node, entry.sequence)) : null;
  };
  return { id: source.id, title: source.title, records: { all, query,
    first: (contract, q) => lookup(contract, q, "first"),
    last: (contract, q) => lookup(contract, q, "last"),
  } };
}
