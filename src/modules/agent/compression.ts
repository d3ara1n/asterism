import { thinkingLevels, type ModelItem, type ModelTarget, type ModelEvent } from "@atelier/sdk/contracts";
import type { ModelServices, ObjectExecutor } from "@atelier/sdk/runtime";
import { ContextSummary, Execution, Notice } from "./records.ts";
import { summaryPrompt, summarySystemPrompt } from "./compression-prompt.ts";
import { contextMessages, projectAgentContext, type AgentContext } from "./projection.ts";

// 窗口预留与近期保留预算；工具结果截取只用于独立的摘要材料。
export const COMPRESSION_RESERVE = 16_384;
export const COMPRESSION_KEEP_RECENT = 20_000;
export const COMPRESSION_MAX_OUTPUT = Math.floor(COMPRESSION_RESERVE * 0.8);

/** 字符估算只用于选取和触发；不作为 provider 实报计量持久化。 */
function estimateItems(items: readonly ModelItem[]): number {
  return items.reduce((sum, item) => {
    const content = item.kind === "result" ? item.outcome.model : item.parts;
    return sum + 4 + Math.ceil(JSON.stringify(content).length / 4);
  }, 0);
}
/** 实报 input 已含缓存；仅增加该请求起点之后的输出、结果与新消息，禁止重复加 cacheRead。 */
export function estimateContext(context: AgentContext, agentId: string, model: string, systemTokens: number): number {
  const positions = new Map(context.path.map((record, index) => [record.id, index]));
  const summaryPosition = context.summary ? positions.get(context.summary.record.id)! : -1;
  for (let index = context.path.length - 1; index >= 0; index--) {
    const record = context.path[index]!;
    if (record.source?.resource?.id !== agentId) continue;
    const decoded = Execution.decode(record);
    if (decoded?.status !== "known" || decoded.data.type !== "block") continue;
    const block = decoded.data.block, input = block.completion?.usage?.input;
    if (input == null || !(block.source.model === model || thinkingLevels.some(level => block.source.model === `${model}:${level}`))) continue;
    const origin = block.requestParentId === null ? -1 : positions.get(block.requestParentId);
    if (origin === undefined || origin < summaryPosition) continue;
    return input + estimateItems(context.groups.filter(group => group.last > origin).flatMap(group => group.items));
  }
  return systemTokens + estimateItems(contextMessages(context));
}
export interface CompressionPlan { keptFrom: string; messages: ModelItem[]; previousSummary?: string }
/** 投影可把响应移到期间事件之前；只有前后两部分在时间线上也不交错时才可截取。 */
export function planCompression(context: AgentContext): CompressionPlan | null {
  const { groups, path } = context;
  if (groups.length < 2) return null;
  let tokens = 0, desired = groups.length - 1;
  for (; desired >= 0; desired--) {
    tokens += estimateItems(groups[desired]!.items);
    if (tokens >= COMPRESSION_KEEP_RECENT) break;
  }
  if (desired <= 0) return null;
  const prefixLast: number[] = [], suffixFirst: number[] = [];
  for (let i = 0; i < groups.length; i++) prefixLast[i] = Math.max(prefixLast[i - 1] ?? -1, groups[i]!.last);
  for (let i = groups.length - 1; i >= 0; i--) suffixFirst[i] = Math.min(suffixFirst[i + 1] ?? Infinity, groups[i]!.first);
  for (let cut = desired; cut > 0; cut--) {
    if (prefixLast[cut - 1]! >= suffixFirst[cut]!) continue;
    if (!groups[cut]!.items.some(item => item.kind === "input" || item.kind === "output")) continue;
    return {
      keptFrom: path[suffixFirst[cut]!]!.id,
      messages: groups.slice(0, cut).flatMap(group => group.items),
      ...(context.summary ? { previousSummary: context.summary.data.summary } : {}),
    };
  }
  return null;
}
/** 运行在代理托管任务内；仅完整成功的摘要一次提交，取消沿用代理生命周期。 */
export async function compressContext(
  object: ObjectExecutor, target: ModelTarget, systemTokens: number,
  models: Pick<ModelServices, "stream" | "list" | "roles">, signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  const model = target.model ?? models.roles().find(role => role.id === target.role)?.model;
  if (!model) return false;
  const window = models.list().find(entry => entry.model === model)?.contextWindow;
  if (!window) return false;
  const context = projectAgentContext(object.session.snapshot(), object.ref.id);
  const tokensBefore = estimateContext(context, object.ref.id, model, systemTokens);
  if (tokensBefore <= window - COMPRESSION_RESERVE) return false;
  const plan = planCompression(context);
  if (!plan) return false;
  let text = "";
  const parts = new Map<string, { kind: "text" | "thinking"; ended: boolean }>();
  let finish: Extract<ModelEvent, { type: "finish" }> | undefined;
  try {
    for await (const event of models.stream({ target: { ...target, model, thinking: "off" },
      system: { blocks: [{ id: "context-summary", kind: "system", from: "atelier.core", text: summarySystemPrompt }] },
      messages: [{ kind: "input", parts: [{ kind: "text", text: summaryPrompt(plan) }] }],
      maxOutputTokens: COMPRESSION_MAX_OUTPUT, signal,
    })) {
      signal.throwIfAborted();
      if (finish) throw new Error("The summary stream continued after completion.");
      if (event.type === "part.start") {
        if (event.part.kind === "toolcall") throw new Error("Context summarization attempted to call a tool.");
        parts.set(event.part.id, { kind: event.part.kind, ended: false });
      } else if (event.type === "part.delta") {
        const part = parts.get(event.partId);
        if (!part || part.ended) throw new Error("The summary stream updated an inactive part.");
        if (part.kind === "text") text += event.delta;
      } else if (event.type === "part.end") {
        const part = parts.get(event.partId);
        if (!part || part.ended) throw new Error("The summary stream ended an inactive part.");
        part.ended = true;
      } else finish = event;
    }
    signal.throwIfAborted();
    if (!finish || finish.reason !== "stop" || !text.trim() || [...parts.values()].some(part => !part.ended))
      throw new Error("Context summarization did not produce a complete non-empty summary.");
  } catch (error) {
    signal.throwIfAborted();
    object.commit(writer => { writer.append(Notice, { code: "context_compression_failed", level: "warning",
      message: `Context compression failed; the existing context is unchanged. ${error instanceof Error ? error.message : "The summary request failed."}` }); });
    return false;
  }
  // 提交失败交给代理循环报告；不能把持久化故障伪装成可继续的摘要失败。
  object.commit(writer => { writer.append(ContextSummary, {
    summary: text.trim(), keptFrom: plan.keptFrom, model: finish.source?.model ?? model, tokensBefore,
    completion: { usage: finish.usage, finishReason: finish.reason, rawFinishReason: finish.rawFinishReason ?? null, providerResponseId: finish.responseId ?? null },
  }); });
  return true;
}
