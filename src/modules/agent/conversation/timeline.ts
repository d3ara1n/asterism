import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, Usage } from "@atelier/sdk/contracts";
import { Execution, Notice, UserMessage } from "../records";

type SavedBlock = Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"] & {
  id: string; createdAt: string; usage: Usage | null;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; text: string }
  | ({ kind: "notice"; id: string } & z.infer<typeof Notice.schema>);
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
function item(record: SessionRecord, agentId: string): TimelineItem | null {
  const notice = Notice.decode(record);
  if (notice?.status === "known" && (record.resource === null || record.resource.id === agentId)) return { kind: "notice", id: record.id, ...notice.data };
  if (record.resource?.id !== agentId) return null;
  const message = UserMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, text: message.data.text };
  const execution = Execution.decode(record);
  if (execution?.status === "known" && execution.data.type === "block") return {
    ...execution.data.block, id: record.id, createdAt: record.createdAt, usage: execution.data.block.completion?.usage ?? null,
  };
  return null;
}
/** 路径记录与挂在路径上的未完成块构成审计视图；实时块以响应身份接续。 */
export function conversationTimeline(snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[]): TimelineItem[] {
  const path = snapshot.records.all({ scope: "path" });
  const onPath = new Set(path.map(record => record.id));
  const dangling = new Map<string, SessionRecord[]>();
  for (const record of snapshot.records.all({ scope: "session" })) {
    const execution = Execution.decode(record);
    if (!onPath.has(record.id) && record.parentId && onPath.has(record.parentId)
      && execution?.status === "known" && execution.data.type === "block" && !execution.data.block.complete) {
      dangling.set(record.parentId, [...dangling.get(record.parentId) ?? [], record]);
    }
  }
  const saved = path.flatMap(record => [record, ...dangling.get(record.id) ?? []])
    .flatMap(record => { const value = item(record, agentId); return value ? [value] : []; });
  const keys = new Set(saved.map(timelineKey));
  return [...saved, ...live.filter(block => !keys.has(timelineKey(block)))];
}
