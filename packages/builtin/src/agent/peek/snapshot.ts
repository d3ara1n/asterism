import type { ModelInputPart, SessionSnapshot } from "@atelier/sdk/contracts";
import { ContextSummary, Execution, AgentInputMessage } from "@atelier/builtin-api/contracts";
import { projectInputMessage } from "../input-message.ts";

export interface PeekRecord {
  id: string;
  kind: "user" | "agent" | "assistant" | "tool" | "thinking" | "summary" | "notice" | "context";
  at: string;
  status: string;
  text: string;
}
const partsText = (parts: readonly ModelInputPart[]) => parts.map(part => part.kind === "text" ? part.text
  : `[Saved file: ${part.filename ?? "attachment"}; ${part.mediaType}]`).join("\n");

/** 调查投影保留时间线保存顺序与原始记录身份；压缩摘要在这里也是一条记录。 */
export function projectPeekRecords(snapshot: Pick<SessionSnapshot, "records">, agentId: string, includeThinking: boolean): PeekRecord[] {
  const result: PeekRecord[] = [];
  for (const record of snapshot.records.all({ scope: "timeline" })) {
    const add = (kind: PeekRecord["kind"], text: string, status = "saved") =>
      result.push({ id: record.id, at: record.createdAt, kind, status, text });
    if (record.source?.resource?.id === agentId) {
      const message = AgentInputMessage.decode(record);
      const execution = Execution.decode(record);
      const summary = ContextSummary.decode(record);
      if ([message, execution, summary].some(value => value?.status === "unknown")) {
        add("notice", `Saved record ${record.contract.id} could not be decoded.`, "unreadable");
      } else if (message?.status === "known") {
        const projected = projectInputMessage(message.data);
        add(message.data.sender.kind, partsText(projected.parts));
      }
      else if (summary?.status === "known") add("summary", summary.data.summary);
      else if (execution?.status === "known") {
        const block = execution.data.block, status = block.complete ? "complete" : "incomplete";
        if (block.kind === "text") add("assistant", block.text, status);
        else if (block.kind === "thinking") {
          if (includeThinking && (block.text || block.summary))
            add("thinking", [block.text, block.summary && `Saved thinking summary:\n${block.summary}`].filter(Boolean).join("\n\n"), status);
        } else add("tool", JSON.stringify({
          name: block.name, callId: block.callId,
          arguments: block.arguments ?? block.argumentsText,
          outcome: block.outcome ? {
            kind: block.outcome.kind, resource: block.outcome.resource,
            data: block.outcome.data, text: partsText(block.outcome.model),
            ...("error" in block.outcome ? { error: block.outcome.error } : {}),
            ...("message" in block.outcome ? { message: block.outcome.message } : {}),
          } : null,
        }), block.outcome?.kind ?? status);
      }
    }
    if (record.context && (record.context.recipient === null || record.context.recipient === agentId))
      add("context", record.context.text);
  }
  return result;
}

/** 有界概览仅影响初始输入；全部正文始终保留在本次记录集合中供检索。 */
export function peekOverview(records: readonly PeekRecord[], budget: number): string {
  const rows: string[] = [];
  let remaining = budget;
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index]!;
    const inline = record.kind === "user" || record.kind === "agent" || record.kind === "assistant" || record.kind === "summary";
    const excerpt = inline ? record.text.slice(0, 1200) : "";
    const row = JSON.stringify({ id: record.id, kind: record.kind, at: record.at, status: record.status,
      length: record.text.length, ...(inline ? { excerpt, remaining: record.text.length - excerpt.length } : {}) });
    if (row.length > remaining) break;
    rows.unshift(row); remaining -= row.length + 1;
  }
  return `Saved records: ${records.length}. Recent entries shown: ${rows.length}. Earlier entries and full text are available through search_records and read_records.\n${rows.join("\n")}`;
}
