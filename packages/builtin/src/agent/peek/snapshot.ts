import type { ModelInputPart, SessionSnapshot } from "@asterism-app/sdk/contracts";
import { decodeExecution, ContextSummary, AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { projectInputMessage } from "../input-message.ts";

export interface PeekRecord {
  id: string;
  kind: "user" | "agent" | "event" | "assistant" | "tool" | "thinking" | "summary" | "notice" | "context";
  at: string;
  status: string;
  text: string;
}
const partsText = (parts: readonly ModelInputPart[]) => parts.map(part => part.kind === "text" ? part.text
  : `[Saved file: ${part.filename ?? "attachment"}; ${part.mediaType}]`).join("\n");

/** Investigation projection preserves timeline save order and original record identities; a compression summary is also a record here. */
export function projectPeekRecords(snapshot: Pick<SessionSnapshot, "records">, agentId: string, includeThinking: boolean): PeekRecord[] {
  const result: PeekRecord[] = [];
  for (const record of snapshot.records.all({ scope: "timeline" })) {
    const add = (kind: PeekRecord["kind"], text: string, status = "saved") =>
      result.push({ id: record.id, at: record.createdAt, kind, status, text });
    if (record.source?.resource?.id === agentId) {
      const message = AgentInputMessage.decode(record);
      const execution = decodeExecution(record);
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

/** Dialogue and summaries are included in full; other admitted blocks retain retrieval labels. */
export function peekOutline(records: readonly PeekRecord[]): string {
  const rows = records.map(record => {
    const inline = record.kind === "user" || record.kind === "agent" || record.kind === "event" || record.kind === "assistant" || record.kind === "summary";
    const label = JSON.stringify({ id: record.id, kind: record.kind, at: record.at, status: record.status, length: record.text.length });
    return inline ? `${label}\n${record.text}` : label;
  });
  return `Saved records: ${records.length}. Dialogue and summaries are included in full; other blocks are represented by retrieval labels. Full saved text is available through search_records and read_records.\n\n${rows.join("\n\n")}`;
}
