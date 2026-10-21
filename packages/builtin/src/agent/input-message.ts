import type { ModelInputPart } from "@atelier/sdk/contracts";
import type { AgentMessageSender } from "@atelier/builtin-api/contracts";

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

/** 信封只参与模型投影；持久正文、附件与编辑器保持原样。 */
export function projectInputMessage(message: { sender: AgentMessageSender; parts: readonly ModelInputPart[] }): { kind: "input"; parts: ModelInputPart[] } {
  const { sender, parts } = message;
  if (sender.kind === "user") return { kind: "input", parts: [...parts] };
  return { kind: "input", parts: [
    { kind: "text", text: `<agent-message sender-id="${escape(sender.resource.id)}" sender-name="${escape(sender.name)}">` },
    ...parts.map(part => part.kind === "text" ? { ...part, text: escape(part.text) } : part),
    { kind: "text", text: "</agent-message>" },
  ] };
}
