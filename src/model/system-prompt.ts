import type { SystemPrompt } from "@asterism/sdk/contracts";

/** The body is Markdown; neutralize only tag syntax `<name` and `</name`, preserving all other characters. */
function escapeTags(value: string): string {
  return value.replace(/<(?=\/?[A-Za-z])/g, "&lt;");
}
function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** XML-like markup is the model view; block identity stays outside the body, and attribute order and delimiters are determined here alone. */
export function projectSystemPrompt(prompt: SystemPrompt): string {
  return prompt.blocks.map(block => {
    const attribute = block.kind === "system" ? `from="${escapeAttribute(block.from)}"` : block.kind === "agent" ? `role="${escapeAttribute(block.role)}"` : `file="${escapeAttribute(block.file)}"`;
    return `<${block.kind} ${attribute}>\n${escapeTags(block.text)}\n</${block.kind}>`;
  }).join("\n\n");
}
