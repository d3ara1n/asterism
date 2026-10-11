import type { Json, RecordRef } from "@atelier/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { UserMessage, Execution, Notice, ContextNotice } from "../modules/agent/records.ts";
import { isBlockNode } from "../shared/session-path.ts";

/** core 领域与既有物理格式的适配集中于此，不进入公开 SDK。 */
export function decodeCoreRecord(node: SessionNode): { contract: RecordRef; data: Json } | null {
  if (!isBlockNode(node) && node.kind !== "message" && node.kind !== "notice" && !(node.kind === "event" && node.model !== null)) return null;
  const { id: _id, sessionId: _session, parentId: _parent, createdAt: _created, kind, ...rest } = node;
  const contract = isBlockNode(node) ? Execution : kind === "message" ? UserMessage : kind === "notice" ? Notice
    : node.kind === "event" && node.model !== null ? ContextNotice : { id: node.kind === "event" ? node.type : "" };
  const data = (isBlockNode(node) ? { type: "block", block: {
    responseId: node.responseId, requestParentId: node.requestParentId, ordinal: node.ordinal,
    complete: node.complete, continuation: node.continuation,
    source: { model: node.model, adapter: node.adapter, scope: node.scope },
    completion: node.finishReason === null ? null : { usage: node.usage, finishReason: node.finishReason,
      rawFinishReason: node.rawFinishReason, providerResponseId: node.providerResponseId },
    ...(node.kind === "toolcall" ? { kind: node.kind, callId: node.callId, name: node.name,
      argumentsText: node.argumentsText, arguments: node.arguments, outcome: node.outcome } : { kind: node.kind, text: node.text }),
  } } : node.kind === "event" && node.model !== null ? { text: node.model, recipient: node.agentId,
    origin: { type: node.type, data: node.data } }
    : kind === "event" ? node.data : kind === "notice" ? { code: node.code, message: node.message, level: node.level,
      ...(node.response ? { response: node.response } : {}) } : rest) as Json;
  return { contract: { id: contract.id }, data };
}
