import type { SessionRecord, ModelBlock, ModelItem, ModelPart } from "@atelier/sdk/contracts";
import { PluginApiError, type SessionSnapshot } from "@atelier/sdk/runtime";
import { Execution, UserMessage } from "./records.ts";

/** 按请求起点组合响应，事件顺序不改变；上下文只从当前时间线读取。 */
export function projectForAgent(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ModelItem[] {
  const path = snapshot.records.all({ scope: "timeline" });
  const positions = new Map(path.map((record, index) => [record.id, index]));
  const responses = new Map<string, { record: SessionRecord; block: ModelBlock }[]>();
  for (const record of path) {
    if (record.source?.resource?.id !== agentId) continue;
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
      // 唯一的上下文截取规则：记录可能因回溯、断网或取消停在思考之后，末尾思考不作为模型输出结尾。
      const parts = blocks.map(({ block }) => part(block));
      while (parts.at(-1)?.kind === "thinking") parts.pop();
      if (parts.length) out.push({ kind: "output", scope: first.source.scope, adapter: first.source.adapter, parts });
      for (const { block } of blocks) if (block.kind === "toolcall" && block.outcome)
        out.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome });
    }
  };
  emit(null);
  for (const record of path) {
    const message = UserMessage.decode(record);
    if (message?.status === "known" && record.source?.resource?.id === agentId) out.push({ kind: "input", parts: message.data.parts });
    // 平台公开的模型可见文本：任何记录可携带，按接收者投影。
    const context = record.context;
    if (context && (context.recipient === null || context.recipient === agentId))
      out.push({ kind: "context", parts: [{ kind: "text", text: context.text }] });
    emit(record.id);
  }
  return out;
}
function part(block: ModelBlock): ModelPart {
  return block.kind === "toolcall"
    ? { kind: "toolcall", callId: block.callId, name: block.name, arguments: block.arguments, continuation: block.continuation }
    : { kind: block.kind, text: block.text, continuation: block.continuation };
}
