import { thinkingLevels, describeError, type ModelItem, type ModelTarget, type ModelEvent } from "@asterism-app/sdk/contracts";
import type { ModelServices, ObjectExecutor } from "@asterism-app/sdk/runtime";
import { ContextSummary, Execution } from "@asterism-app/builtin-api/contracts";
import { feedbackOrigin, type AgentFeedback } from "./feedback.ts";
import { summaryPrompt, summarySystemPrompt } from "./compression-prompt.ts";
import { contextMessages, projectAgentContext, type AgentContext } from "./projection.ts";

import { COMPRESSION_KEEP_RECENT, COMPRESSION_MAX_OUTPUT, COMPRESSION_RESERVE } from "./context-budget.ts";

// Window reserve and recent-content retention budgets; tool results are excerpted only for the separate summary material.
export { COMPRESSION_KEEP_RECENT, COMPRESSION_MAX_OUTPUT, COMPRESSION_RESERVE } from "./context-budget.ts";

/** Character-based estimates are used only for selection and triggering; they are not persisted as provider-reported measurements. */
function estimateItems(items: readonly ModelItem[]): number {
  return items.reduce((sum, item) => {
    const content = item.kind === "result" ? item.outcome.model : item.parts;
    return sum + 4 + Math.ceil(JSON.stringify(content).length / 4);
  }, 0);
}
/** Reported input already includes cached tokens; add only output, results, and new messages after that request's starting point, without counting cacheRead again. */
export function estimateContext(context: AgentContext, agentId: string, model: string, systemTokens: number): number {
  const positions = new Map(context.path.map((record, index) => [record.id, index]));
  const summaryPosition = context.summary ? positions.get(context.summary.record.id)! : -1;
  for (let index = context.path.length - 1; index >= 0; index--) {
    const record = context.path[index]!;
    if (record.source?.resource?.id !== agentId) continue;
    const decoded = Execution.decode(record);
    if (decoded?.status !== "known") continue;
    const block = decoded.data.block, input = block.completion?.usage?.input;
    if (input == null || !(block.source.model === model || thinkingLevels.some(level => block.source.model === `${model}:${level}`))) continue;
    const origin = block.requestParentId === null ? -1 : positions.get(block.requestParentId);
    if (origin === undefined || origin < summaryPosition) continue;
    return input + estimateItems(context.groups.filter(group => group.last > origin).flatMap(group => group.items));
  }
  return systemTokens + estimateItems(contextMessages(context));
}
export interface CompressionPlan { keptFrom: string; messages: ModelItem[]; previousSummary?: string }
/** Projection can move a response before intervening events; a cut is valid only when the two resulting parts also do not interleave on the timeline. */
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
/** Runs within an agent-managed task; only a fully successful summary is committed, in one operation, and cancellation follows the agent lifecycle. */
export async function compressContext(
  object: ObjectExecutor, target: ModelTarget, systemTokens: number,
  models: Pick<ModelServices, "stream" | "list" | "roles">, signal: AbortSignal,
  feedback: (value: AgentFeedback) => void, userAgent?: string,
  onStart?: () => (status: "completed" | "failed" | "cancelled") => void,
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
  const end = onStart?.();
  let completed = false;
  try {
    const result = await summarizeContext(object, target, model, models, signal, feedback, plan, tokensBefore, userAgent);
    completed = result;
    return result;
  } finally {
    end?.(completed ? "completed" : signal.aborted ? "cancelled" : "failed");
  }
}

/** Reports success only after the complete summary is saved; generation failure preserves the original model projection. */
async function summarizeContext(
  object: ObjectExecutor, target: ModelTarget, model: string,
  models: Pick<ModelServices, "stream">, signal: AbortSignal, feedback: (value: AgentFeedback) => void,
  plan: CompressionPlan, tokensBefore: number, userAgent?: string,
): Promise<boolean> {
  let text = "";
  const parts = new Map<string, { kind: "text" | "thinking"; ended: boolean }>();
  let finish: Extract<ModelEvent, { type: "finish" }> | undefined;
  try {
    for await (const event of models.stream({ target: { ...target, model, thinking: "off" },
      userAgent, sessionId: object.ref.sessionId,
      system: { blocks: [{ id: "context-summary", kind: "system", from: "asterism.builtin", text: summarySystemPrompt }] },
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
    const details = describeError(error);
    feedback({ origin: feedbackOrigin(error), code: "context_compression_failed", level: "warning",
      message: `Context compression failed; the existing context is unchanged. ${details.message}`, details });
    return false;
  }
  // Let the agent loop report commit failures; persistence faults must not be disguised as recoverable summary failures.
  object.commit(writer => { writer.append(ContextSummary, {
    summary: text.trim(), keptFrom: plan.keptFrom, model: finish.source?.model ?? model, tokensBefore,
    completion: { usage: finish.usage, finishReason: finish.reason, rawFinishReason: finish.rawFinishReason ?? null, providerResponseId: finish.responseId ?? null,
      ...(finish.timing ? { timing: finish.timing } : {}) },
  }); });
  return true;
}
