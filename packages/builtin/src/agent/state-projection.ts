import type { ModelBlock, SessionRecord, SessionSnapshot } from "@asterism/sdk/contracts";
import { Execution, AgentInputMessage } from "@asterism/builtin-api/contracts";
import type { AgentTurnState } from "./state.ts";

/** 当前路径叠加本次运行时的中断位置；模型输入由上下文投影独立生成。 */
export function projectAgentTurnState(
  snapshot: Pick<SessionSnapshot, "records">,
  agentId: string,
  interruptions: readonly (string | null)[] = [],
): AgentTurnState {
  return projectTurnState(snapshot.records.all({ scope: "timeline" }), agentId, interruptions);
}

/** 同一状态规则也用于历史轮次；传入该轮的记录区间，不创建历史快照副本。 */
export function projectTurnState(records: readonly SessionRecord[], agentId: string, interruptions: readonly (string | null)[] = []): AgentTurnState {
  let hasInput = false;
  let responseId: string | null = null;
  let interrupted = false;
  const blocks = new Map<number, ModelBlock>();
  const stopped = new Set(interruptions);
  for (const record of records) {
    if (stopped.has(record.parentId)) interrupted = true;
    if (record.source?.resource?.id !== agentId) continue;
    if (AgentInputMessage.decode(record)?.status === "known") {
      hasInput = true;
      responseId = null;
      blocks.clear();
      interrupted = false;
      continue;
    }
    if (!hasInput) continue;
    const execution = Execution.decode(record);
    if (execution?.status === "known") {
      const block = execution.data.block;
      if (block.responseId !== responseId) {
        responseId = block.responseId;
        blocks.clear();
        interrupted = false;
      }
      blocks.set(block.ordinal, block);
    }
  }
  if (stopped.has(records.at(-1)?.id ?? null)) interrupted = true;
  if (!hasInput) return "empty";
  if (interrupted) return "incomplete";
  const response = [...blocks.values()];
  const terminal = response.find(block => block.completion);
  // 终态随最高序号块保存；历史可能停在工具结果尚未全部落库的位置。
  const completed = terminal?.completion?.finishReason === "stop"
    && terminal.ordinal + 1 === blocks.size
    && response.every(block => block.ordinal < blocks.size && block.complete && block.kind !== "toolcall");
  return completed ? "completed" : "incomplete";
}
