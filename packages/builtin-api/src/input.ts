import { z } from "zod";
import { modelInputPartSchema, fileReferencePartSchema } from "@asterism-app/sdk/contracts";

export const agentInputPartSchema = z.union([modelInputPartSchema, fileReferencePartSchema]);
export type AgentInputPart = z.infer<typeof agentInputPartSchema>;
export function inputFileName(part: Exclude<AgentInputPart, { kind: "text" }>): string {
  return part.filename ?? (part.kind === "file" ? part.mediaType : part.mediaType ?? part.ref.source.id);
}
/** Shared body limits for one Agent input message, independent of its sender or delivery mode. */
export const agentInputPartsSchema = z.array(agentInputPartSchema).min(1).max(128)
  .refine(parts => parts.some(part => part.kind !== "text" || part.text.trim().length > 0), "A message requires text or a file.")
  .refine(parts => parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n").length <= 100_000, "The message text exceeds the size limit.");
export function inputSummary(parts: readonly AgentInputPart[]): string {
  return parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n").trim()
    || parts.flatMap(part => part.kind === "text" ? [] : [inputFileName(part)]).join(", ");
}
