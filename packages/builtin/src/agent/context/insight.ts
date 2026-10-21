import { completionData, type ModelInputPart, type ModelItem, type SessionSnapshot } from "@atelier/sdk/contracts";
import { contextMessages, projectAgentContext } from "../context-projection.ts";
import { ContextSummary, Execution, AgentRequestContext, AgentInputMessage, type AgentRequestContextData } from "@atelier/builtin-api/contracts";

/** 对话构成的固定类别与展示顺序；docs/workbench.md#代理上下文。 */
export const conversationCategories = ["user", "agentMessage", "assistant", "thinking", "toolcall", "result", "context", "summary"] as const;
export type ConversationCategory = typeof conversationCategories[number];

export interface ContextInsight {
  /** 最近一次本代理工作请求的实报 input；没有可用计量时为 null。 */
  usage: { input: number; model: string; scope: string; compressedAfter: boolean } | null;
  conversation: { characters: Record<ConversationCategory, number>; total: number; files: number };
  /** 与窗口占用取自同一个工作请求的终态扩展。 */
  system: { responseId: string; diagnostics: AgentRequestContextData } | null;
}

/** 字数按 Unicode 码点计，与请求诊断一致。 */
export const characters = (text: string) => [...text].length;

function addParts(parts: readonly ModelInputPart[], category: ConversationCategory, target: ContextInsight["conversation"]) {
  for (const part of parts) {
    if (part.kind === "text") target.characters[category] += characters(part.text);
    else target.files++;
  }
}
function addItem(item: ModelItem, inputCategory: "user" | "agentMessage", target: ContextInsight["conversation"]) {
  if (item.kind === "input" || item.kind === "context")
    return addParts(item.parts, item.kind === "input" ? inputCategory : "context", target);
  if (item.kind === "result") return addParts(item.outcome.model, "result", target);
  if (item.kind !== "output") return;
  for (const part of item.parts) {
    if (part.kind === "text") target.characters.assistant += characters(part.text);
    else if (part.kind === "thinking") target.characters.thinking += characters(part.text || part.summary);
    else target.characters.toolcall += characters(JSON.stringify(part.arguments));
  }
}

/** 只读当前路径；对话构成复用下一次请求的模型投影，窗口占用与系统部分只取已保存的真实计量。 */
export function contextInsight(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ContextInsight {
  const context = projectAgentContext(snapshot, agentId);
  const conversation: ContextInsight["conversation"] = {
    characters: Object.fromEntries(conversationCategories.map(category => [category, 0])) as Record<ConversationCategory, number>,
    total: 0, files: 0,
  };
  if (context.summary) {
    // 摘要计量包含实际投影的提示信封。
    const summary = contextMessages(context)[0]!;
    if (summary.kind === "context") addParts(summary.parts, "summary", conversation);
  }
  for (const group of context.groups) {
    const input = AgentInputMessage.decode(context.path[group.first]!);
    const category = input?.status === "known" && input.data.sender.kind === "agent" ? "agentMessage" : "user";
    group.items.forEach(item => addItem(item, category, conversation));
  }
  conversation.total = conversationCategories.reduce((sum, category) => sum + conversation.characters[category], 0);

  let usage: ContextInsight["usage"] = null, system: ContextInsight["system"] = null, compressedAfter = false;
  for (let index = context.path.length - 1; index >= 0; index--) {
    const record = context.path[index]!;
    if (record.source?.resource?.id !== agentId) continue;
    if (ContextSummary.decode(record)?.status === "known") compressedAfter = true;
    const execution = Execution.decode(record);
    if (execution?.status !== "known" || execution.data.type !== "block") continue;
    const block = execution.data.block;
    if (!block.completion) continue;
    const diagnostics = completionData(block.completion, AgentRequestContext);
    if (diagnostics) system = { responseId: block.responseId, diagnostics };
    const input = block.completion.usage?.input;
    if (input != null) usage = { input, model: block.source.model, scope: block.source.scope, compressedAfter };
    break;
  }
  return { usage, conversation, system };
}

/** 最大余数法分配瓷砖；非零类别至少一格，确切数值由明细给出。 */
export function allocateTiles(values: readonly number[], tiles: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map(value => value / total * tiles);
  const counts = exact.map((value, index) => values[index]! > 0 ? Math.max(1, Math.floor(value)) : 0);
  let rest = tiles - counts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).filter(({ index }) => values[index]! > 0);
  order.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; rest > 0 && order.length; i = (i + 1) % order.length, rest--) counts[order[i]!.index]!++;
  // 保底格超出时从最大类别回收。
  while (rest < 0) { const largest = counts.indexOf(Math.max(...counts)); counts[largest]!--; rest++; }
  return counts;
}
