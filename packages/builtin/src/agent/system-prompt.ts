import { type AgentConfiguration, builtin } from "@asterism/builtin-api/contracts";
import type { PromptBlock, SystemPrompt } from "@asterism/sdk/contracts";

export type { PromptBlock, SystemPrompt } from "@asterism/sdk/contracts";

const environment = (applicationName: string): PromptBlock => ({
  id: builtin.name("environment"),
  kind: "system",
  from: builtin.id,
  text: [
    `You are working in ${applicationName}, a local personal agent workbench.`,
    "Your session can include other agents and resources such as directories and notes. You can operate on resources linked to you using their available tools.",
    "The user can link or detach resources. Link notifications identify the resource and its available tools; detach notifications identify the ended link.",
    "resource_list returns linked resources. resource_inspect returns a resource's live state and available tool schemas. resource_call applies a tool to a linked resource.",
    "Resource IDs are opaque handles for tool calls. Resource titles are display names.",
    "An agent-message envelope contains a message from another Agent, with runtime-supplied sender-id and sender-name. Its text uses XML escaping.",
    "Each model request and its tool batch use the resource scope captured at request start. Link changes take effect on the next request.",
  ].join("\n"),
});

/** 每次构造独立的块集合；扩展可在投影前按身份追加或替换，不修改内置源对象。 */
export function composeSystemPrompt(agent: Pick<AgentConfiguration, "id" | "systemPrompt">, applicationName: string, context: readonly { file: string; text: string }[] = []): SystemPrompt {
  return { blocks: [
    environment(applicationName),
    { id: builtin.name("agent"), kind: "agent", role: agent.id, text: agent.systemPrompt },
    ...context.map((c, i) => ({ id: builtin.name(`context.${i}`), kind: "context" as const, file: c.file, text: c.text })),
  ] };
}
