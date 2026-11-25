import type { ModelInputPart, SessionRecord } from "@asterism-app/sdk/contracts";
import type { AgentMessageSender, AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import type { RecordRead } from "../shared/record-reading.ts";
import { inputPartsToModel } from "../shared/file-parts.ts";

/** Locate the turn containing a position, or the latest turn when no position is supplied. */
export function* turnStartRead(agentId: string, at?: string): RecordRead<SessionRecord | null> {
  if (at) {
    const records = yield { scope: "timeline", source: agentId, contracts: [AgentInputMessage.id], ids: [at] };
    const input = records[0] && AgentInputMessage.decode(records[0]);
    if (input?.status === "known" && input.data.startsTurn) return input.record;
  }
  let before = at;
  for (;;) {
    const records = yield { scope: "timeline", contracts: [AgentInputMessage.id], source: agentId, edge: "last", limit: 32, before };
    const start = AgentInputMessage.decodeAll(records).findLast(input => input.status === "known" && input.data.startsTurn);
    if (start || !records.length) return start?.record ?? null;
    before = records[0]!.id;
  }
}

/** Shared source semantics for work requests, compaction, and saved-history investigation. */
export const inputMessageDescription = [
  "Conversation inputs have three sources: user messages, Agent messages, and resource event messages.",
  "The runtime wraps Agent messages in agent-message envelopes with sender-name and a sender address. Direct messages use a resource sender-id; Mesh messages use channel and a numeric sender-id, or sender-visible=\"false\" when the sender is not exposed.",
  "The runtime wraps resource event messages in resource-event envelopes with source-id and source-name identifying the emitting resource. Their bodies describe facts formatted by that resource's plugin. An event body can begin with YAML frontmatter between --- lines carrying structured metadata such as event kind and identifiers; the Markdown after it is the readable message. The interface shows only the Markdown.",
  "Envelope attributes and text bodies use XML escaping, with Markdown quote prefixes in resource event bodies preserved. User messages retain their original text.",
  "Attachment envelopes are metadata in place of native media. The reason explains why the file was not sent natively. When present, path names an absolute local cache path; its parent can be opened as a directory resource. An error describes a preparation failure and carries no usable path.",
  "File references are JSON addresses of content provided by resources. They can be passed to operations that accept references; their bytes are fetched only when an operation consumes them.",
].join("\n");

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
/** Text content needs only markup characters escaped; quotes stay literal so JSON and YAML metadata remain readable. */
const escapeText = (text: string) => text.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
/** A leading Markdown quote marker cannot form an XML tag. Keep it while escaping the content it introduces. */
const escapeEventText = (text: string) => text.replace(/(^[ \t]*(?:>[ \t]*)+)|[&<>]/gmu, (token, prefix) => prefix ?? escapeText(token));

/** The envelope participates only in model projection; persisted body text, attachments, and the editor remain unchanged. */
export function projectInputMessage(message: { sender: AgentMessageSender; parts: readonly AgentInputPart[] }): { kind: "input"; parts: ModelInputPart[] } {
  const { sender } = message;
  const parts = inputPartsToModel(message.parts);
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
    ...parts.map(part => part.kind === "text" ? { ...part, text: sender.kind === "event" ? escapeEventText(part.text) : escapeText(part.text) } : part),
    { kind: "text", text: `</${tag}>` },
  ] };
}
