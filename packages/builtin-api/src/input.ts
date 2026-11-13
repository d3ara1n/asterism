import { z } from "zod";
import { modelInputPartSchema, fileReferencePartSchema, type Json, type JsonObject } from "@asterism-app/sdk/contracts";

export const agentInputPartSchema = z.union([modelInputPartSchema, fileReferencePartSchema]);
export type AgentInputPart = z.infer<typeof agentInputPartSchema>;
export function inputFileName(part: Exclude<AgentInputPart, { kind: "text" }>): string {
  return part.filename ?? (part.kind === "file" ? part.mediaType : part.mediaType ?? part.ref.source.id);
}
/** Shared body limits for one Agent input message, independent of its sender or delivery mode. */
export const agentInputPartsSchema = z.array(agentInputPartSchema).min(1).max(128)
  .refine(parts => parts.some(part => part.kind !== "text" || part.text.trim().length > 0), "A message requires text or a file.")
  .refine(parts => parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n").length <= 100_000, "The message text exceeds the size limit.");
/** Strings that YAML reads back as the same string without quotes; anything else is written as JSON, which YAML also accepts. */
const plainScalar = /^[A-Za-z_][\w./@-]*$/u;
const reservedScalar = /^(?:true|false|null|yes|no|on|off|y|n)$/iu;
const frontmatterKey = /^[A-Za-z_][\w.-]*$/u;
function scalar(value: Json): string {
  return typeof value === "string" && plainScalar.test(value) && !reservedScalar.test(value) ? value : JSON.stringify(value);
}
/**
 * Resource event text: YAML frontmatter with structured metadata for the receiving Agent, then the Markdown body people read.
 * Each metadata value occupies one line, so no metadata line can close the block. Omitted metadata produces the body alone.
 */
export function resourceEventText(metadata: JsonObject, body: string): string {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (!entries.length) return body;
  for (const [key] of entries) if (!frontmatterKey.test(key)) throw new Error(`Invalid event metadata key: ${key}`);
  return ["---", ...entries.map(([key, value]) => `${key}: ${scalar(value)}`), "---", "", body].join("\n");
}
/** Separates leading frontmatter from the body; text without a complete leading block is all body. */
export function splitResourceEventText(text: string): { metadata: string | null; body: string } {
  if (!text.startsWith("---\n")) return { metadata: null, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0 || (text.length > end + 4 && text[end + 4] !== "\n")) return { metadata: null, body: text };
  return { metadata: text.slice(4, end), body: text.slice(end + 5).replace(/^\n/u, "") };
}
/** Parts shown to people: an event's leading frontmatter is model-facing metadata and is omitted from display. */
export function displayInputParts(message: { sender: { kind: string }; parts: readonly AgentInputPart[] }): readonly AgentInputPart[] {
  if (message.sender.kind !== "event") return message.parts;
  return message.parts.flatMap((part, index) => {
    if (index !== 0 || part.kind !== "text") return [part];
    const { body } = splitResourceEventText(part.text);
    return body.trim() ? [{ ...part, text: body }] : [];
  });
}
export function inputSummary(parts: readonly AgentInputPart[]): string {
  return parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n").trim()
    || parts.flatMap(part => part.kind === "text" ? [] : [inputFileName(part)]).join(", ");
}
