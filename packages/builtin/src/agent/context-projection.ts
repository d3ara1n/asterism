import type { SessionRecord, SessionSnapshot, ModelBlock, ModelItem } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { ContextSummary, Execution, AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { projectInputMessage } from "./input-message.ts";
import { responseMessages } from "./response-messages.ts";

/** Projection depends only on pure contracts; background requests and the frontend context panel share the same rules, and the background entry point converts failures to plugin errors. */
export class ContextProjectionError extends Error {}
/** A response and all its tool results are indivisible; indices always refer to the full timeline. */
export interface ContextGroup { items: ModelItem[]; first: number; last: number }
export interface AgentContext {
  path: readonly SessionRecord[];
  groups: ContextGroup[];
  summary: { record: SessionRecord; data: z.infer<typeof ContextSummary.schema> } | null;
}
function summaryItem(summary: string): ModelItem {
  return { kind: "context", parts: [{ kind: "text", text: `The following summary describes earlier conversation. Recent messages follow it.\n<summary>\n${summary}\n</summary>` }] };
}
export function contextMessages(context: AgentContext): ModelItem[] {
  return [...(context.summary ? [summaryItem(context.summary.data.summary)] : []), ...context.groups.flatMap(group => group.items)];
}
export function projectForAgent(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ModelItem[] {
  return contextMessages(projectAgentContext(snapshot, agentId));
}
/** Groups responses by request starting point without changing event order; boundaries are checked on the full path so request starting points are preserved. */
export function projectAgentContext(snapshot: Pick<SessionSnapshot, "records">, agentId: string): AgentContext {
  const path = snapshot.records.all({ scope: "timeline" });
  const positions = new Map(path.map((record, index) => [record.id, index]));
  const responses = new Map<string, { record: SessionRecord; block: ModelBlock }[]>();
  let summary: AgentContext["summary"] = null;
  for (const record of path) {
    if (record.source?.resource?.id !== agentId) continue;
    const checkpoint = ContextSummary.decode(record);
    if (checkpoint?.status === "unknown") throw new ContextProjectionError("The context summary could not be decoded.");
    if (checkpoint?.status === "known") summary = checkpoint;
    const decoded = Execution.decode(record);
    if (decoded?.status !== "known" || !decoded.data.block.complete) continue;
    const block = decoded.data.block;
    const blocks = responses.get(block.responseId) ?? [];
    blocks.push({ record, block }); responses.set(block.responseId, blocks);
  }
  const after = new Map<string | null, { record: SessionRecord; block: ModelBlock }[][]>();
  for (const blocks of responses.values()) {
    const origin = blocks[0]!.block.requestParentId;
    const position = origin === null ? -1 : positions.get(origin);
    if (position === undefined || blocks.some(item => item.block.requestParentId !== origin || position >= positions.get(item.record.id)!))
      throw new ContextProjectionError("Response request origin is not a preceding record on this path.");
    const groups = after.get(origin) ?? [];
    groups.push(blocks.sort((a, b) => a.block.ordinal - b.block.ordinal)); after.set(origin, groups);
  }
  const groups: ContextGroup[] = [];
  const emit = (origin: string | null) => {
    for (const blocks of after.get(origin) ?? []) {
      const items = responseMessages(blocks.map(({ block }) => block));
      const indices = blocks.map(({ record }) => positions.get(record.id)!);
      if (items.length) groups.push({ items, first: Math.min(...indices), last: Math.max(...indices) });
    }
  };
  emit(null);
  for (const [index, record] of path.entries()) {
    const message = AgentInputMessage.decode(record);
    if (message?.status === "known" && record.source?.resource?.id === agentId)
      groups.push({ first: index, last: index, items: [projectInputMessage(message.data)] });
    const context = record.context;
    if (context && (context.recipient === null || context.recipient === agentId))
      groups.push({ first: index, last: index, items: [{ kind: "context", parts: [{ kind: "text", text: context.text }] }] });
    emit(record.id);
  }
  if (!summary) return { path, groups, summary };
  const boundary = positions.get(summary.data.keptFrom);
  if (boundary === undefined || boundary >= positions.get(summary.record.id)!)
    throw new ContextProjectionError("The context summary retained boundary is not a preceding record on this path.");
  let retaining = false;
  for (const group of groups) {
    if (group.first >= boundary) retaining = true;
    else if (group.last >= boundary || retaining)
      throw new ContextProjectionError("The context summary boundary splits a response or reorders context.");
  }
  return { path, summary, groups: groups.filter(group => group.first >= boundary) };
}
