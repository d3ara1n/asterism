import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, Usage, ModelInputPart } from "@atelier/sdk/contracts";
import { Execution, Notice, UserMessage } from "../records";

type SavedBlock = Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"] & {
  id: string; createdAt: string; usage: Usage | null;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; parts: readonly ModelInputPart[] }
  | ({ kind: "notice"; id: string } & z.infer<typeof Notice.schema>);
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
function item(record: SessionRecord, agentId: string): TimelineItem | null {
  const notice = Notice.decode(record);
  if (notice?.status === "known" && (!record.source?.resource || record.source?.resource.id === agentId)) return { kind: "notice", id: record.id, ...notice.data };
  if (record.source?.resource?.id !== agentId) return null;
  const message = UserMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, parts: message.data.parts };
  const execution = Execution.decode(record);
  if (execution?.status === "known" && execution.data.type === "diagnostic") {
    const { response, ...diagnostic } = execution.data;
    return { ...diagnostic, kind: "notice", id: record.id,
      ...(response ? { response: { ...response, model: response.source.model } } : {}) };
  }
  if (execution?.status === "known" && execution.data.type === "block") return {
    ...execution.data.block, id: record.id, createdAt: record.createdAt, usage: execution.data.block.completion?.usage ?? null,
  };
  return null;
}
/** 所有已保存块直接来自当前路径；实时块以响应身份接续。 */
export function conversationTimeline(snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[]): TimelineItem[] {
  const path = snapshot.records.all({ scope: "timeline" });
  const saved = path.flatMap(record => { const value = item(record, agentId); return value ? [value] : []; });
  const keys = new Set(saved.map(timelineKey));
  return [...saved, ...live.filter(block => !keys.has(timelineKey(block)))];
}
