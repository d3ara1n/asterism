import type { Json, ToolOutcome } from "../shared/model.ts";
import type { BlockNode, SessionNode } from "../shared/session.ts";
import { isBlock } from "./tree.ts";

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
 * - 响应进行期间插入的可见事件延后到该响应的结果之后；
 * - 不完整 block、通知与 response_end 不发给模型。
 * 规则只依赖路径上已有节点，因此同一路径的投影稳定，前缀缓存不受存储顺序影响。
 */
export function projectForAgent(path: readonly SessionNode[], agentId: string): ModelItem[] {
  const out: ModelItem[] = [];
  let open: { responseId: string; blocks: BlockNode[] } | null = null;
  let deferred: ModelItem[] = [];
  const flush = () => {
    if (!open) return;
    const blocks = [...open.blocks].sort((a, b) => a.ordinal - b.ordinal);
    const first = blocks[0]!;
    out.push({ kind: "output", scope: first.scope, adapter: first.adapter, parts: blocks.map(part) });
    for (const b of blocks) if (b.kind === "toolcall" && b.outcome) out.push({ kind: "result", callId: b.callId, name: b.name, outcome: b.outcome });
    out.push(...deferred);
    open = null; deferred = [];
  };
  for (const node of path) {
    if (isBlock(node)) {
      if (node.agentId !== agentId || !node.complete) continue;
      const current = open as { responseId: string; blocks: BlockNode[] } | null;
      if (current?.responseId !== node.responseId) { flush(); open = { responseId: node.responseId, blocks: [node] }; }
      else current.blocks.push(node);
      continue;
    }
    if (node.kind === "response_end") { if (node.agentId === agentId && open?.responseId === node.responseId) flush(); continue; }
    const item = visible(node, agentId);
    if (!item) continue;
    if (open) deferred.push(item);
    else out.push(item);
  }
  flush();
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
