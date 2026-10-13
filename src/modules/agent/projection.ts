import type { SessionRecord, ModelBlock, ModelItem, ModelPart } from "@atelier/sdk/contracts";
import { PluginApiError, type SessionSnapshot } from "@atelier/sdk/runtime";
import { Execution, UserMessage, ContextNotice } from "./records.ts";

/** 按请求起点组合响应，事件顺序不改变；上下文只从当前时间轴读取。 */
export function projectForAgent(snapshot: Pick<SessionSnapshot, "records">, agentId: string, at?: string | null): ModelItem[] {
  const records = snapshot.records.all({ scope: "path" });
  const path = at === undefined ? records : at === null ? [] : records.slice(0, records.findIndex(record => record.id === at) + 1);
  const positions = new Map(path.map((record, index) => [record.id, index]));
  const responses = new Map<string, { record: SessionRecord; block: ModelBlock }[]>();
  for (const record of path) {
    if (record.source.resource?.id !== agentId) continue;
    const decoded = Execution.decode(record);
    if (decoded?.status !== "known" || decoded.data.type !== "block" || !decoded.data.block.complete) continue;
    const block = decoded.data.block;
    const blocks = responses.get(block.responseId) ?? [];
    blocks.push({ record, block }); responses.set(block.responseId, blocks);
  }
  const after = new Map<string | null, { record: SessionRecord; block: ModelBlock }[][]>();
  for (const blocks of responses.values()) {
    const origin = blocks[0]!.block.requestParentId;
    const position = origin === null ? -1 : positions.get(origin);
    if (position === undefined || blocks.some(item => item.block.requestParentId !== origin || position >= positions.get(item.record.id)!))
      throw new PluginApiError("invalid_argument", "Response request origin is not a preceding record on this path.");
    const groups = after.get(origin) ?? [];
    groups.push(blocks.sort((a, b) => a.block.ordinal - b.block.ordinal)); after.set(origin, groups);
  }
  const out: ModelItem[] = [];
  const emit = (origin: string | null) => {
    for (const blocks of after.get(origin) ?? []) {
      const first = blocks[0]!.block;
      out.push({ kind: "output", scope: first.source.scope, adapter: first.source.adapter, parts: blocks.map(({ block }) => part(block)) });
      for (const { block } of blocks) if (block.kind === "toolcall" && block.outcome)
        out.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome });
    }
  };
  emit(null);
  for (const record of path) {
    const message = UserMessage.decode(record);
    if (message?.status === "known" && record.source.resource?.id === agentId) out.push({ kind: "input", parts: message.data.parts });
    const context = ContextNotice.decode(record);
    if (context?.status === "known" && (context.data.recipient === null || context.data.recipient === agentId))
      out.push({ kind: "context", parts: [{ kind: "text", text: context.data.text }] });
    emit(record.id);
  }
  return out;
}
function part(block: ModelBlock): ModelPart {
  return block.kind === "toolcall"
    ? { kind: "toolcall", callId: block.callId, name: block.name, arguments: block.arguments, continuation: block.continuation }
    : { kind: block.kind, text: block.text, continuation: block.continuation };
}
