import type { Decoded, Json, RecordContract, RecordQuery, ResourceRef, ResourceSnapshot, SessionRecord, SessionSnapshot, SessionView } from "@asterism/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import type { NodeView } from "../session/view.ts";
import { deepFreeze } from "../shared/immutable.ts";

/** 存储节点到公开记录信封的直接映射：契约、来源、载荷与模型可见文本原样取自节点，宿主不解释。 */
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
  const resources = () => foldWorkbench(source.read({ scope: "timeline", contracts: ["resource_created", "resource_renamed", "object_removed"] })
    .map(({ node }) => node)).objects;
  const snapshot = (object: FoldedObject) => resourceSnapshot({ sessionId: source.id, id: object.id, kind: object.kind }, object);
  return {
    ...sessionView(source), position: Object.freeze({ nodeId: source.nodeId }),
    resources: {
      all: () => Object.freeze(resources().map(snapshot)),
      get(contract, objectId) {
        const object = resources().find(object => object.id === objectId && object.kind === contract.kind);
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
 * 快照只持有固定位置的读取柄；每次查询只映射和解码被选中的记录。
 * 位置与节点均不可变、记录已深冻结，同一快照内相同的 `all` 查询复用结果，多个投影不重复复制整条历史。
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
