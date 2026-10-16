import type { SystemPrompt } from "@atelier/sdk/contracts";

/** 正文为 Markdown；只中和标签语法 `<name` 与 `</name`，其余字符原样保留。 */
function escapeTags(value: string): string {
  return value.replace(/<(?=\/?[A-Za-z])/g, "&lt;");
}
function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** XML-like 是模型视图；块身份不参与正文，属性顺序和分隔符由此唯一确定。 */
export function projectSystemPrompt(prompt: SystemPrompt): string {
  return prompt.blocks.map(block => {
    const attribute = block.kind === "system" ? `from="${escapeAttribute(block.from)}"` : block.kind === "agent" ? `role="${escapeAttribute(block.role)}"` : `file="${escapeAttribute(block.file)}"`;
    return `<${block.kind} ${attribute}>\n${escapeTags(block.text)}\n</${block.kind}>`;
  }).join("\n\n");
}
