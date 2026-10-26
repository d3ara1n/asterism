import { present, type ModelRequestContext } from "@asterism/sdk/contracts";
import { AgentRequestContext } from "@asterism/builtin-api/contracts";

/** 从宿主交付的最终请求现场提取领域资料，随终态一次保存。 */
export function agentRequestExtensions({ system, tools }: ModelRequestContext) {
  const characters = (text: string) => [...text].length;
  return [present(AgentRequestContext, {
    system: system.blocks.map(block => block.kind === "system" ? { kind: "system", from: block.from, characters: characters(block.text) }
      : block.kind === "agent" ? { kind: "agent", role: block.role, characters: characters(block.text) }
        : { kind: "context", file: block.file, characters: characters(block.text) }),
    tools: tools.map(tool => tool.name),
  })];
}
