import { type AgentPromptBlock, builtin } from "@asterism-app/builtin-api/contracts";
import type { SystemPrompt } from "@asterism-app/sdk/contracts";
import { inputMessageDescription } from "./input-message.ts";


export const environment = (applicationName: string): AgentPromptBlock => ({
  id: builtin.name("environment"),
  kind: "system",
  from: builtin.id,
  source: { id: builtin.name("environment"), plugin: builtin.id },
  text: [
    `You are working in ${applicationName}, a local personal agent workbench.`,
    "Your session can include other agents and resources such as directories and notes. You can operate on resources linked to you using their available tools.",
    "The user can link or detach resources. resource_attached and resource_detached notices identify the resource whose link changed.",
    "Resource IDs are opaque instance identifiers used by tool calls and resource URLs. Resource titles are display names.",
    "Any message can contain references: Markdown links whose destinations are reference URLs. [label](resource:<resource_id>/<location>) names a location the resource interprets; directory and manual locations are resource-relative file paths. [label](skill:<name>) or [label](skill:<name>/<package_path>) names a skill or a file in its package, read with skill_read. Location and path segments are percent-encoded and separated by /. A reference URL is text: it grants no access and can name a resource that is absent or not linked to you.",
    "Footnotes use standard Markdown syntax.",
    inputMessageDescription,
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
