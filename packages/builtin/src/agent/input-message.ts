import type { ModelInputPart } from "@asterism-app/sdk/contracts";
import type { AgentMessageSender } from "@asterism-app/builtin-api/contracts";

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

/** The envelope participates only in model projection; persisted body text, attachments, and the editor remain unchanged. */
export function projectInputMessage(message: { sender: AgentMessageSender; parts: readonly ModelInputPart[] }): { kind: "input"; parts: ModelInputPart[] } {
  const { sender, parts } = message;
  if (sender.kind === "user") return { kind: "input", parts: [...parts] };
  const address = sender.mesh
    ? `channel="${escape(sender.mesh.channel)}" ${sender.mesh.id === null ? 'sender-visible="false"' : `sender-id="${sender.mesh.id}"`}`
    : `sender-id="${escape(sender.resource.id)}"`;
  return { kind: "input", parts: [
    { kind: "text", text: `<agent-message ${address} sender-name="${escape(sender.name)}">` },
    ...parts.map(part => part.kind === "text" ? { ...part, text: escape(part.text) } : part),
    { kind: "text", text: "</agent-message>" },
  ] };
}
