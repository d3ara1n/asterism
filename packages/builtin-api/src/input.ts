import { modelInputPartsSchema, modelInputText, type ModelInputPart } from "@asterism-app/sdk/contracts";

/** Shared body limits for one Agent input message, independent of its sender or delivery mode. */
export const agentInputPartsSchema = modelInputPartsSchema.max(128)
  .refine(parts => parts.some(part => part.kind === "file" || part.text.trim().length > 0), "A message requires text or a file.")
  .refine(parts => modelInputText(parts).length <= 100_000, "The message text exceeds the size limit.");
export function inputSummary(parts: readonly ModelInputPart[]): string {
  return modelInputText(parts).trim() || parts.flatMap(part => part.kind === "file" ? [part.filename ?? part.mediaType] : []).join(", ");
}
