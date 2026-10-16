import type { ModelBlock, SessionSnapshot } from "@atelier/sdk/contracts";
import { Execution, Notice, UserMessage } from "@atelier/builtin-api/contracts";
import type { AgentTurnState } from "./state.ts";

/** 从当前路径推导回合状态；不完整块参与判断，模型输入仍由上下文投影独立生成。 */
export function projectAgentTurnState(
  snapshot: Pick<SessionSnapshot, "records">,
  agentId: string,
): AgentTurnState {
  let hasInput = false;
  let responseId: string | null = null;
  let interrupted = false;
  const blocks = new Map<number, ModelBlock>();
  for (const record of snapshot.records.all({ scope: "timeline" })) {
    if (record.source?.resource?.id !== agentId) continue;
    if (UserMessage.decode(record)?.status === "known") {
      hasInput = true;
      responseId = null;
      blocks.clear();
      interrupted = false;
      continue;
    }
    if (!hasInput) continue;
    const execution = Execution.decode(record);
    if (execution?.status === "known" && execution.data.type === "block") {
      const block = execution.data.block;
      if (block.responseId !== responseId) {
        responseId = block.responseId;
        blocks.clear();
        interrupted = false;
      }
      blocks.set(block.ordinal, block);
      continue;
    }
    const notice = Notice.decode(record);
    const diagnostic = execution?.status === "known" && execution.data.type === "diagnostic"
      ? execution.data : notice?.status === "known" ? notice.data : null;
    if (diagnostic && (diagnostic.level === "error" || diagnostic.code === "cancelled")) interrupted = true;
  }
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
