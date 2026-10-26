import { z } from "zod";
import type { Json, ModelItem, StreamRequest } from "@asterism/sdk/contracts";
import type { PeekRecord } from "./snapshot.ts";

const search = z.strictObject({
  query: z.string().max(256).describe("Case-insensitive literal text. An empty string lists records in timeline order."),
  cursor: z.number().int().nonnegative().optional().describe("Next cursor returned by the previous page."),
  limit: z.number().int().min(1).max(20).optional().describe("Maximum matching records, default 8."),
});
const read = z.strictObject({
  id: z.string().min(1).describe("Saved record ID returned by the overview or search_records."),
  offset: z.number().int().nonnegative().optional().describe("UTF-16 text offset, default 0; nextOffset continues a previous read."),
  limit: z.number().int().min(1).max(16000).optional().describe("Maximum UTF-16 text length, default 8000."),
});
export const retrievalTools: NonNullable<StreamRequest["tools"]> = [
  { name: "search_records", description: "Search this fixed Agent record snapshot, or enumerate its record directory with an empty query.", parameters: z.toJSONSchema(search) as Json },
  { name: "read_records", description: "Read a saved record's text with explicit pagination.", parameters: z.toJSONSchema(read) as Json },
];

/** 唯一检索数据源是已授权目标的记录投影；调用结果使用模型公开协议配对。 */
export function retrieve(records: readonly PeekRecord[], call: { name: string; callId: string; arguments: Json }): {
  result: Extract<ModelItem, { kind: "result" }>; ids: string[];
} {
  let data: Json, ids: string[] = [];
  try {
    if (call.name === "search_records") {
      const args = search.parse(call.arguments), query = args.query.toLowerCase();
      const matches: Json[] = [];
      let cursor = args.cursor ?? 0;
      for (; cursor < records.length && matches.length < (args.limit ?? 8); cursor++) {
        const record = records[cursor]!, at = record.text.toLowerCase().indexOf(query);
        if (at < 0) continue;
        ids.push(record.id);
        matches.push({ id: record.id, kind: record.kind, at: record.at, status: record.status,
          length: record.text.length, excerpt: record.text.slice(Math.max(0, at - 100), at + 300) });
      }
      data = { matches, nextCursor: cursor < records.length ? cursor : null };
    } else if (call.name === "read_records") {
      const args = read.parse(call.arguments), record = records.find(record => record.id === args.id);
      if (!record) throw new Error("The record ID is outside this investigation snapshot.");
      const offset = args.offset ?? 0;
      if (offset > record.text.length) throw new Error(`offset exceeds the record length (${record.text.length}).`);
      const end = Math.min(record.text.length, offset + (args.limit ?? 8000));
      ids = [record.id];
      data = { id: record.id, kind: record.kind, status: record.status, offset, length: record.text.length,
        text: record.text.slice(offset, end), nextOffset: end < record.text.length ? end : null };
    } else throw new Error(`Unknown investigation tool: ${call.name}. Available tools: search_records, read_records.`);
    return { ids, result: { kind: "result", callId: call.callId, name: call.name,
      outcome: { kind: "succeeded", data, model: [{ kind: "text", text: JSON.stringify(data) }] } } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The record query failed.";
    return { ids: [], result: { kind: "result", callId: call.callId, name: call.name,
      outcome: { kind: "rejected", data: null, error: { code: "invalid_record_query", message }, model: [{ kind: "text", text: message }] } } };
  }
}
