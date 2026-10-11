import type { Json, RecordContract, RecordQuery, SessionRecord, SessionView } from "@atelier/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { coreId } from "../shared/core.ts";
import type { ResourceRef, ResourceSnapshot, SessionSnapshot } from "@atelier/sdk/runtime";
import { foldWorkbench, type FoldedObject } from "../session/fold.ts";
import { isBlockNode } from "../shared/session-path.ts";

/**
 * 现有存储格式到公开记录信封的固定映射：message 映为 core 用户消息，块与通知按 kind，
 * 资源事件以其 type 为契约 ID。版本表由当前存储格式决定，不从最新 schema 猜测。
 */
const legacy: Record<string, { id: string; version: number }> = {
  message: { id: "atelier.core/agent.user-message", version: 1 },
  thinking: { id: "atelier.core/agent.thinking", version: 1 },
  text: { id: "atelier.core/agent.text", version: 1 },
  toolcall: { id: "atelier.core/agent.toolcall", version: 1 },
  notice: { id: coreId("notice"), version: 1 },
};
export function toRecord(node: SessionNode, sequence: number, kinds: ReadonlyMap<string, string> = new Map()): SessionRecord {
  const { id, sessionId, parentId, createdAt, kind, ...rest } = node;
  const owner = "agentId" in rest && typeof rest.agentId === "string" ? rest.agentId : null;
  const contract = kind === "event" ? { id: node.type, version: 1 } : legacy[kind]!;
  const data = (isBlockNode(node) ? {
    responseId: node.responseId, requestParentId: node.requestParentId, ordinal: node.ordinal,
    complete: node.complete, continuation: node.continuation,
    source: { model: node.model, adapter: node.adapter, scope: node.scope },
    completion: node.finishReason === null ? null : { usage: node.usage, finishReason: node.finishReason,
      rawFinishReason: node.rawFinishReason, providerResponseId: node.providerResponseId },
    ...(node.kind === "toolcall" ? { kind: node.kind, callId: node.callId, name: node.name,
      argumentsText: node.argumentsText, arguments: node.arguments, outcome: node.outcome } : { kind: node.kind, text: node.text }),
  } : kind === "event" ? node.data : rest) as Json;
  return freeze({ id, sessionId, parentId, sequence, createdAt, contract,
    resource: owner ? { id: owner, kind: kinds.get(owner) ?? "atelier.core/agent" } : null, data: structuredClone(data) });
}
export function toRecords(nodes: readonly SessionNode[], all: readonly SessionNode[]): SessionRecord[] {
  const order = new Map(all.map((node, index) => [node.id, index + 1]));
  const kinds = new Map<string, string>();
  for (const node of all) if (node.kind === "event" && node.type === "resource_created") {
    const data = node.data as { id?: unknown; type?: unknown };
    if (typeof data.id === "string" && typeof data.type === "string") kinds.set(data.id, data.type);
  }
  return nodes.map(node => toRecord(node, order.get(node.id) ?? 0, kinds));
}
/** JSON 视图递归冻结，避免观察者或解码者修改另一消费者读到的原始记录。 */
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function resourceSnapshot(ref: ResourceRef, resource: FoldedObject): ResourceSnapshot {
  const { id: _id, type: _type, title: _title, ...data } = resource.data;
  return freeze({ ref: { ...ref }, title: resource.title, data: structuredClone(data) as Json });
}
export function sessionSnapshot(id: string, title: string, nodes: readonly SessionNode[], path: readonly SessionNode[]): SessionSnapshot {
  const resources = Object.freeze(foldWorkbench(path).objects.map(object =>
    resourceSnapshot({ sessionId: id, id: object.id, kind: object.kind }, object)));
  return {
    ...sessionView(id, title, nodes, path), position: Object.freeze({ nodeId: path.at(-1)?.id ?? null }),
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
  const pathRecords = Object.freeze(session.filter(record => onPath.has(record.id)));
  const all = (query: RecordQuery) => query.scope === "session" ? session : pathRecords;
  const query = <D extends Json>(contract: RecordContract<D>, q: RecordQuery) =>
    all(q).flatMap(record => { const decoded = contract.decode(record); return decoded ? [decoded] : []; });
  return { id, title, records: { all, first: (contract, q) => query(contract, q)[0] ?? null, query } };
}
