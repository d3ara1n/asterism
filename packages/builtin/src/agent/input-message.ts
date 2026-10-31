import type { ModelInputPart } from "@asterism-app/sdk/contracts";
import type { AgentMessageSender, AgentInputPart } from "@asterism-app/builtin-api/contracts";

/** Shared source semantics for work requests, compaction, and saved-history investigation. */
export const inputMessageDescription = [
  "Conversation inputs have three sources: user messages, Agent messages, and resource event messages.",
  "The runtime wraps Agent messages in agent-message envelopes with sender-name and a sender address. Direct messages use a resource sender-id; Mesh messages use channel and a numeric sender-id, or sender-visible=\"false\" when the sender is not exposed.",
  "The runtime wraps resource event messages in resource-event envelopes with source-id and source-name identifying the emitting resource. Their bodies describe facts formatted by that resource's plugin.",
  "Envelope attributes and text bodies use XML escaping. User messages retain their original text.",
  "File references are JSON addresses of content provided by resources. They can be passed to operations that accept references; their bytes are fetched only when an operation consumes them.",
].join("\n");

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

/** The envelope participates only in model projection; persisted body text, attachments, and the editor remain unchanged. */
export function projectInputMessage(message: { sender: AgentMessageSender; parts: readonly AgentInputPart[] }): { kind: "input"; parts: ModelInputPart[] } {
  const { sender } = message;
  const parts: ModelInputPart[] = message.parts.map(part => part.kind === "file-reference"
    ? { kind: "text", text: JSON.stringify(part) } : part);
  if (sender.kind === "user") return { kind: "input", parts: [...parts] };
  const tag = sender.kind === "event" ? "resource-event" : "agent-message";
  let attributes: string;
  if (sender.kind === "event") {
    attributes = `source-id="${escape(sender.resource.id)}" source-name="${escape(sender.name)}"`;
  } else {
    const address = sender.mesh
      ? `channel="${escape(sender.mesh.channel)}" ${sender.mesh.id === null ? 'sender-visible="false"' : `sender-id="${sender.mesh.id}"`}`
      : `sender-id="${escape(sender.resource.id)}"`;
    attributes = `${address} sender-name="${escape(sender.name)}"`;
  }
  return { kind: "input", parts: [
    { kind: "text", text: `<${tag} ${attributes}>` },
    ...parts.map(part => part.kind === "text" ? { ...part, text: escape(part.text) } : part),
    { kind: "text", text: `</${tag}>` },
  ] };
}
