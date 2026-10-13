import type { Json, RecordContract, RecordSource } from "@atelier/sdk/contracts";
import { UserMessage, Execution, Notice } from "../modules/agent/records.ts";
import { emptyCompletion } from "../shared/session.ts";
import type { SessionHostWriter } from "./host.ts";

/** core 领域与既有物理格式的适配集中于此，不进入公开 SDK；来源由宿主打戳后传入。 */
export function appendCoreRecord(writer: SessionHostWriter, contract: RecordContract, data: Json, source: RecordSource): string | null {
  const resource = source.resource;
  if (contract.id === UserMessage.id) {
    if (!resource) throw new Error("User messages must be written by the receiving resource.");
    return writer.append({ kind: "message", source, parts: UserMessage.schema.parse(data).parts });
  }
  if (contract.id === Notice.id) {
    return writer.append({ kind: "notice", source, ...Notice.schema.parse(data) });
  }
  if (contract.id === Execution.id) {
    if (!resource) throw new Error("Model execution records require a resource.");
    const event = Execution.schema.parse(data);
    if (event.type === "diagnostic") return writer.append({ kind: "notice", source,
      code: event.code, message: event.message, level: event.level });
    if (event.type === "block") {
      const { source: origin, completion, ...block } = event.block;
      return writer.append({ ...block, ...emptyCompletion, ...completion, source,
        model: origin.model, adapter: origin.adapter, scope: origin.scope });
    }
    if (event.ordinal === null) return writer.append({ kind: "notice", source, level: "error", code: "empty_response",
      message: "The provider finished without returning any content blocks.",
      response: { responseId: event.responseId, requestParentId: event.requestParentId, model: event.source.model, ...event.completion } });
    const block = writer.nodes().find(node => "responseId" in node && node.responseId === event.responseId
      && node.source.resource?.id === resource.id && node.ordinal === event.ordinal);
    if (!block) throw new Error("The terminal response block has not been committed.");
    writer.completeBlock(block.id, event.completion);
    return block.id;
  }
  return null;
}
