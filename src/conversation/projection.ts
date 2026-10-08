import type { ConversationNode, ExtensionNode, Json, Part, ToolOutcome } from "../shared/conversation.ts";
import { ConversationError, canContinue, pathTo, type ConversationState } from "./store.ts";
import { z } from "zod";

export type ModelItem = { kind: "input" | "context"; text: string } | { kind: "output"; parts: Part[]; replay: Json; scope: string; adapter: string }
  | { kind: "result"; callId: string; name: string; outcome: ToolOutcome };
export interface ExtensionProjection {
  decode(data: Json, version: number): Json;
  model(data: Json): ModelItem[];
  user(data: Json): Json[];
}
export type ExtensionRegistry = ReadonlyMap<string, ExtensionProjection>;
/** 压缩只作用于当前祖先路径；跳回压缩前自然重新取得原始上下文。 */
export function projectModel(state: ConversationState, extensions: ExtensionRegistry = new Map()): ModelItem[] {
  let result: ModelItem[] = [];
  for (const node of pathTo(state)) {
    if (!canContinue(node)) throw new ConversationError("conflict", "Incomplete history cannot be projected for continuation.");
    switch (node.kind) {
      case "input": result.push({ kind: "input", text: node.text }); break;
      case "compaction": result = [{ kind: "input", text: `Conversation summary:\n${node.summary}` }]; break;
      case "model":
        result.push({ kind: "output", parts: node.parts, replay: node.replay, scope: node.request.scope, adapter: node.request.adapter });
        for (const part of node.parts) if (part.kind === "tool" && part.outcome) result.push({ kind: "result", callId: part.callId, name: part.name, outcome: part.outcome });
        break;
      case "extension":
        if (node.model === "required") {
          const handler = requireExtension(node, extensions);
          result.push(...handler.model(handler.decode(node.data, node.version)));
        }
    }
  }
  return result;
}
function requireExtension(node: ExtensionNode, extensions: ExtensionRegistry): ExtensionProjection {
  if (node.extension === "weft.bindings") return bindingsProjection;
  const handler = extensions.get(node.extension);
  if (!handler) throw new ConversationError("unavailable", `Required conversation extension is unavailable: ${node.extension}`);
  return handler;
}
const bindingData = z.strictObject({ bindingVersion: z.number().int().nonnegative(), resources: z.array(z.strictObject({ resource_id: z.string(), permissions: z.array(z.string()) })) });
const bindingsProjection: ExtensionProjection = {
  decode(data, version) {
    if (version !== 1) throw new ConversationError("unavailable", "Unsupported authorization context version.");
    return bindingData.parse(data);
  },
  model: data => [{ kind: "context", text: "Runtime authorization update. This replaces the previous resource access list for subsequent execution; resource visibility does not grant access.\\n" + JSON.stringify(data) }],
  user: () => [],
};
/** 返回可序列化视图数据；实际 React 渲染不进入能力层。历史中断节点同样可查看。 */
export function projectUser(nodes: ConversationNode[], extensions: ExtensionRegistry = new Map()): Json[] {
  return nodes.flatMap(node => {
    if (node.kind !== "extension") return [node as unknown as Json];
    if (node.user === "omit") return [];
    const handler = extensions.get(node.extension);
    return handler ? handler.user(handler.decode(node.data, node.version)) : [{ kind: "unsupported", id: node.id, extension: node.extension, data: node.data }];
  });
}
