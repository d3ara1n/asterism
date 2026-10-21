import type { SessionSnapshot, Usage } from "@atelier/sdk/contracts";
import { AgentInputMessage } from "@atelier/builtin-api/contracts";
import { diagnosticHistory, type DiagnosticRequest } from "../diagnostics/history";
import { performanceOverview } from "../diagnostics/performance";
import { cacheUsage } from "../diagnostics/usage";
import { projectTurnState } from "../state-projection";

export const usageFields = ["input", "output", "cacheRead", "cacheWrite", "reasoning"] as const satisfies readonly (keyof Usage)[];

/** 以已保存请求计算轮次概要，不写入历史。 */
function summarizeRequests(requests: readonly DiagnosticRequest[]) {
  const usage = Object.fromEntries(usageFields.map(field => {
    const reported = requests.flatMap(request => {
      const value = request.completion?.usage?.[field];
      return value == null ? [] : [value];
    });
    return [field, { value: reported.length ? reported.reduce((sum, value) => sum + value, 0) : null, count: reported.length }];
  })) as Record<typeof usageFields[number], { value: number | null; count: number }>;
  return { count: requests.length, cache: cacheUsage(requests), usage, performance: performanceOverview(requests) };
}
export type TurnMetricsData = ReturnType<typeof summarizeRequests>;
export interface TurnMeasurement {
  inputId: string;
  nextInputId: string | null;
  incomplete: boolean;
  metrics: TurnMetricsData;
  replyMarkdown: string | null;
}

/** 历史轮次保留；批次中的连续输入和 steer 属于同轮，只有当前运行轮隐藏。 */
export function turnMetrics(snapshot: SessionSnapshot, agentId: string, running: boolean): TurnMeasurement[] {
  const path = snapshot.records.all({ scope: "timeline" });
  const starts = path.flatMap((record, index) => {
    if (record.source?.resource?.id !== agentId) return [];
    const message = AgentInputMessage.decode(record);
    return message?.status === "known" && message.data.startsTurn ? [{ record, index }] : [];
  });
  const requests = diagnosticHistory(snapshot, agentId, "timeline").requests.filter(request => request.kind === "response");
  return starts.flatMap((start, index) => {
    const next = starts[index + 1];
    if (!next && running) return [];
    const current = requests.filter(request => request.sequence > start.record.sequence && (!next || request.sequence < next.record.sequence));
    if (!current.length) return [];
    const incomplete = projectTurnState(path.slice(start.index, next?.index), agentId) !== "completed";
    // 请求按时间倒序、块按序号排列；只取最终响应，不回退到工具执行前的过程正文。
    const reply = incomplete ? "" : current[0]!.blocks.flatMap(({ block }) =>
      block.kind === "text" ? [block.text] : []).join("\n\n");
    return [{
      inputId: start.record.id, nextInputId: next?.record.id ?? null,
      incomplete,
      metrics: summarizeRequests(current),
      replyMarkdown: reply.trim() ? reply : null,
    }];
  });
}
