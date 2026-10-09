import type { Json, ToolOutcome } from "../shared/model.ts";
import type { BlockNode, SessionNode } from "../shared/session.ts";
import { isBlockNode, SessionError } from "../shared/session-path.ts";

export type ProjectedPart =
  | { kind: "thinking" | "text"; text: string; continuation: Json }
  | { kind: "toolcall"; callId: string; name: string; arguments: Json; continuation: Json };
export type ModelItem =
  | { kind: "input" | "context"; text: string }
  | { kind: "output"; parts: ProjectedPart[]; scope: string; adapter: string }
  | { kind: "result"; callId: string; name: string; outcome: ToolOutcome };

/**
 * 代理视角的上下文投影：
 * - 只取本代理的 block、发给它的 message 与对它可见的 event；
 * - 同一 responseId 的 block 按 ordinal 合成一条 output，随后按序输出各 toolcall 的结果；
 * - 响应插入请求使用的路径末端之后，首块前及工具执行期间的事件均留在响应外；
 * - 不完整 block 与通知不发给模型，物理节点顺序不变。
 */
export function projectForAgent(path: readonly SessionNode[], agentId: string): ModelItem[] {
  const out: ModelItem[] = [];
  const positions = new Map(path.map((node, index) => [node.id, index]));
  const responses = new Map<string, BlockNode[]>();
  for (const node of path) if (isBlockNode(node) && node.agentId === agentId && node.complete) {
    const blocks = responses.get(node.responseId) ?? [];
    blocks.push(node);
    responses.set(node.responseId, blocks);
  }
  const after = new Map<string | null, BlockNode[][]>();
  for (const blocks of responses.values()) {
    const first = blocks[0]!;
    const origin = first.requestParentId;
    const position = origin === null ? -1 : positions.get(origin);
    if (position === undefined || blocks.some(block => block.requestParentId !== origin || position >= positions.get(block.id)!)) {
      throw new SessionError("invalid_request", "Response request origin is not a preceding node on this path.");
    }
    const groups = after.get(origin) ?? [];
    groups.push(blocks.sort((a, b) => a.ordinal - b.ordinal));
    after.set(origin, groups);
  }
  const emit = (origin: string | null) => {
    for (const blocks of after.get(origin) ?? []) {
      const first = blocks[0]!;
      out.push({ kind: "output", scope: first.scope, adapter: first.adapter, parts: blocks.map(part) });
      for (const block of blocks) if (block.kind === "toolcall" && block.outcome) {
        out.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome });
      }
    }
  };
  emit(null);
  for (const node of path) {
    const item = visible(node, agentId);
    if (item) out.push(item);
    // 起点也可能是对当前代理不可见的其他代理节点。
    emit(node.id);
  }
  return out;
}

function visible(node: SessionNode, agentId: string): ModelItem | null {
  if (node.kind === "message" && node.agentId === agentId) return { kind: "input", text: node.text };
  if (node.kind === "event" && node.model !== null && (node.agentId === null || node.agentId === agentId)) return { kind: "context", text: node.model };
  return null;
}
function part(b: BlockNode): ProjectedPart {
  return b.kind === "toolcall"
    ? { kind: "toolcall", callId: b.callId, name: b.name, arguments: b.arguments, continuation: b.continuation }
    : { kind: b.kind, text: b.text, continuation: b.continuation };
}
