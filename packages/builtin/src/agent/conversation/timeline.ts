import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, ModelInputPart } from "@atelier/sdk/contracts";
import { ContextSummary, Execution, Notice, UserMessage } from "@atelier/builtin-api/contracts";
import { turnMetrics, type TurnMetricsData } from "./turn-metrics";

type SavedBlock = Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"] & {
  id: string; createdAt: string;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; parts: readonly ModelInputPart[] }
  | { kind: "summary"; id: string; text: string }
  | { kind: "turn-metrics"; id: string; metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null }
  | ({ kind: "notice"; id: string } & z.infer<typeof Notice.schema>);
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
/** 对话与诊断共用历史块的展示转换；摘要式思考也能阅读，原始记录不改写。 */
export function savedTimelineBlock(record: Pick<SessionRecord, "id" | "createdAt">,
  block: Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"]): SavedBlock {
  return {
    ...block, id: record.id, createdAt: record.createdAt,
    ...(block.kind === "thinking" ? { text: block.text || block.summary } : {}),
  };
}
function item(record: SessionRecord, agentId: string): TimelineItem | null {
  const notice = Notice.decode(record);
  if (notice?.status === "known" && (!record.source?.resource || record.source?.resource.id === agentId)) return { kind: "notice", id: record.id, ...notice.data };
  if (record.source?.resource?.id !== agentId) return null;
  const summary = ContextSummary.decode(record);
  if (summary?.status === "known") return { kind: "summary", id: record.id, text: summary.data.summary };
  const message = UserMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, parts: message.data.parts };
  const execution = Execution.decode(record);
  if (execution?.status === "known" && execution.data.type === "diagnostic")
    return { ...execution.data, kind: "notice", id: record.id };
  if (execution?.status === "known" && execution.data.type === "block") return savedTimelineBlock(record, execution.data.block);
  return null;
}
/** 所有已保存块直接来自当前路径；实时块以响应身份接续。 */
export function conversationTimeline(snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[], running = live.length > 0): TimelineItem[] {
  const path = snapshot.records.all({ scope: "timeline" });
  const saved = path.flatMap(record => { const value = item(record, agentId); return value ? [value] : []; });
  const keys = new Set(saved.map(timelineKey));
  const summaries = turnMetrics(snapshot, agentId, running);
  const before = new Map(summaries.map(turn => [turn.nextUserId, turn]));
  const measured = (turn: typeof summaries[number]): TimelineItem => ({
    kind: "turn-metrics", id: `turn-metrics:${turn.userId}`, metrics: turn.metrics, incomplete: turn.incomplete,
    replyMarkdown: turn.replyMarkdown,
  });
  const items = saved.flatMap(value => {
    const turn = value.kind === "message" ? before.get(value.id) : undefined;
    return turn ? [measured(turn), value] : [value];
  });
  const last = before.get(null);
  return [...items, ...live.filter(block => !keys.has(timelineKey(block))), ...(last ? [measured(last)] : [])];
}
