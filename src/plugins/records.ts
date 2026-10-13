import type { Decoded, Json, RecordContract, RecordQuery, SessionRecord, SessionView } from "@atelier/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { decodeCoreRecord } from "./core-records.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "@atelier/sdk/contracts";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import { snap } from "../shared/session-path.ts";
import { deepFreeze } from "../shared/immutable.ts";

/**
 * 宿主存储到公开记录信封的固定映射：用户消息、执行块与通知使用 core 契约。
 * 来源原样取自节点，由写入通道打戳；宿主不推断归属。
 */
export function toRecord(node: SessionNode, sequence: number): SessionRecord {
  const { id, sessionId, parentId, createdAt, source, kind: _kind, ...rest } = node;
  const decoded = decodeCoreRecord(node);
  const contract = decoded?.contract ?? { id: node.kind === "event" ? node.type : "" };
  const data = decoded ? decoded.data : node.kind === "event" ? node.data : rest as Json;
  return deepFreeze({ id, sessionId, parentId, sequence, createdAt, contract: { id: contract.id },
    source: structuredClone(source), data: structuredClone(data) });
}
export function toRecords(nodes: readonly SessionNode[], all: readonly SessionNode[]): SessionRecord[] {
  const order = new Map(all.map((node, index) => [node.id, index + 1]));
  return nodes.map(node => toRecord(node, order.get(node.id) ?? 0));
}
export function resourceSnapshot(ref: ResourceRef, resource: FoldedObject): ResourceSnapshot {
  const { id: _id, type: _type, title: _title, ...data } = resource.data;
  return deepFreeze({ ref: { ...ref }, title: resource.title, data: structuredClone(data) as Json });
}
export function sessionSnapshot(id: string, title: string, nodes: readonly SessionNode[], path: readonly SessionNode[], canResume = true): SessionSnapshot {
  const resources = Object.freeze(foldWorkbench(path).objects.map(object =>
    resourceSnapshot({ sessionId: id, id: object.id, kind: object.kind }, object)));
  return {
    ...sessionView(id, title, nodes, path), position: Object.freeze({ nodeId: path.at(-1)?.id ?? null,
      continuationId: path.length && canResume ? snap(nodes, path.at(-1)!.id) : path.at(-1)?.id ?? null }),
    resources: {
      all: () => resources,
      get(contract, objectId) {
        const resource = resources.find(object => object.ref.id === objectId && object.ref.kind === contract.kind);
        if (!resource) return null;
        const parsed = contract.stateSchema.safeParse(resource.data);
        return parsed.success
          ? { status: "known", resource: { ...resource, data: parsed.data } }
          : { status: "unknown", resource, reason: "invalid_data" };
      },
    },
  };
}
/** 固定在读取时刻的视图；之后的提交不改变它。 */
export function sessionView(id: string, title: string, nodes: readonly SessionNode[], path: readonly SessionNode[]): SessionView {
  const session = Object.freeze(toRecords(nodes, nodes));
  const onPath = new Set(path.map(node => node.id));
  const pathRecords: SessionRecord[] = [];
  const sessionFirst = new Map<string, SessionRecord>(), sessionLast = new Map<string, SessionRecord>();
  const pathFirst = new Map<string, SessionRecord>(), pathLast = new Map<string, SessionRecord>();
  const index = (record: SessionRecord, first: Map<string, SessionRecord>, last: Map<string, SessionRecord>) => {
    if (!first.has(record.contract.id)) first.set(record.contract.id, record);
    last.set(record.contract.id, record);
  };
  // 固定快照只建一次首尾索引；高频查询不遍历历史，也不解码无关或较早记录。
  for (const record of session) {
    index(record, sessionFirst, sessionLast);
    if (onPath.has(record.id)) { pathRecords.push(record); index(record, pathFirst, pathLast); }
  }
  Object.freeze(pathRecords);
  const all = (query: RecordQuery) => query.scope === "session" ? session : pathRecords;
  const query = <D extends Json>(contract: RecordContract<D>, q: RecordQuery) =>
    all(q).flatMap(record => { const decoded = contract.decode(record); return decoded ? [decoded] : []; });
  const lookup = <D extends Json>(contract: RecordContract<D>, q: RecordQuery,
    sessionIndex: Map<string, SessionRecord>, pathIndex: Map<string, SessionRecord>): Decoded<D> | null => {
    const record = (q.scope === "session" ? sessionIndex : pathIndex).get(contract.id);
    return record ? contract.decode(record) : null;
  };
  return { id, title, records: { all, query,
    first: (contract, q) => lookup(contract, q, sessionFirst, pathFirst),
    last: (contract, q) => lookup(contract, q, sessionLast, pathLast),
  } };
}
