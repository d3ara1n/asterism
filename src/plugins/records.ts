import type { Json, RecordContract, RecordQuery, SessionRecord, SessionView } from "@atelier/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { coreId } from "../shared/core.ts";

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
export function toRecord(node: SessionNode, sequence: number): SessionRecord {
  const { id, sessionId, parentId, createdAt, kind, ...rest } = node;
  const owner = "agentId" in rest && typeof rest.agentId === "string" ? rest.agentId : null;
  const contract = kind === "event" ? { id: node.type, version: 1 } : legacy[kind]!;
  const data = (kind === "event" ? node.data : rest) as Json;
  return Object.freeze({ id, sessionId, parentId, sequence, createdAt, contract,
    resource: owner ? Object.freeze({ id: owner, kind: "atelier.core/agent" }) : null, data });
}
export function toRecords(nodes: readonly SessionNode[], all: readonly SessionNode[]): SessionRecord[] {
  const order = new Map(all.map((node, index) => [node.id, index + 1]));
  return nodes.map(node => toRecord(node, order.get(node.id) ?? 0));
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
