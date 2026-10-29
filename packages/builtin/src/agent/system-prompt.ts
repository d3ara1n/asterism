import { type AgentPromptBlock, builtin } from "@asterism-app/builtin-api/contracts";
import type { SystemPrompt } from "@asterism-app/sdk/contracts";


export const environment = (applicationName: string): AgentPromptBlock => ({
  id: builtin.name("environment"),
  kind: "system",
  from: builtin.id,
  source: { id: builtin.name("environment"), plugin: builtin.id },
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

/** The body is Markdown; neutralize only tag syntax `<name` and `</name`, preserving all other characters. */
function escapeTags(value: string): string {
  return value.replace(/<(?=\/?[A-Za-z])/g, "&lt;");
}
function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** XML-like markup is the model view; block identity stays outside the body, and attribute order and delimiters are determined here alone. */
export function projectAgentPrompt(blocks: readonly AgentPromptBlock[]): SystemPrompt {
  return { blocks: blocks.map(block => {
    const attribute = block.kind === "system" ? `from="${escapeAttribute(block.from)}"` : block.kind === "agent" ? `role="${escapeAttribute(block.role)}"` : `file="${escapeAttribute(block.file)}"`;
    return { id: block.id, source: block.source, text: `<${block.kind} ${attribute}>\n${escapeTags(block.text)}\n</${block.kind}>` };
  }) };
}
