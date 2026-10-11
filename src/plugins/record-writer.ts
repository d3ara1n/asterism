import type { Json, RecordContract } from "@atelier/sdk/contracts";
import type { ResourceRef } from "@atelier/sdk/runtime";
import { UserMessage, Execution, Notice } from "../modules/agent/records.ts";
import { emptyCompletion } from "../shared/session.ts";
import type { SessionHostWriter } from "./host.ts";

/** 领域记录到宿主原生存储的编码；通用插件事件保存契约身份和载荷。 */
export function appendRecord(writer: SessionHostWriter, contract: RecordContract, data: Json, resource?: ResourceRef): string {
  if (contract.id === UserMessage.id) {
    const message = UserMessage.schema.parse(data);
    if (!resource || message.agentId !== resource.id) throw new Error("The message resource does not match its author.");
    return writer.append({ kind: "message", agentId: resource.id, text: message.text });
  }
  if (contract.id === Notice.id) {
    return writer.append({ kind: "notice", agentId: resource?.id ?? null, ...Notice.schema.parse(data) });
  }
  if (contract.id === Execution.id) {
    if (!resource) throw new Error("Model execution records require a resource.");
    const event = Execution.schema.parse(data);
    if (event.type === "diagnostic") return writer.append({ kind: "notice", agentId: resource.id,
      code: event.code, message: event.message, level: event.level });
    if (event.type === "block") {
      const { source, completion, ...block } = event.block;
      return writer.append({ ...block, ...emptyCompletion, ...completion, agentId: resource.id,
        model: source.model, adapter: source.adapter, scope: source.scope });
    }
    if (event.ordinal === null) return writer.append({ kind: "notice", agentId: resource.id, level: "error", code: "empty_response",
      message: "The provider finished without returning any content blocks.",
      response: { responseId: event.responseId, requestParentId: event.requestParentId, model: event.source.model, ...event.completion } });
    const block = writer.nodes().find(node => "responseId" in node && node.responseId === event.responseId
      && node.agentId === resource.id && node.ordinal === event.ordinal);
    if (!block) throw new Error("The terminal response block has not been committed.");
    writer.completeBlock(block.id, event.completion);
    return block.id;
  }
  return writer.append({ kind: "event", type: contract.id, version: contract.version, data,
    agentId: resource?.id ?? null, model: null });
}
