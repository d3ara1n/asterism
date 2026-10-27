import { modelInputPartsSchema, modelInputText, type ModelInputPart } from "@asterism/sdk/contracts";

/** Business limits for a single user input; model requests accumulate history separately. */
export const userInputPartsSchema = modelInputPartsSchema.max(128)
  .refine(parts => parts.some(part => part.kind === "file" || part.text.trim().length > 0), "A message requires text or a file.")
  .refine(parts => modelInputText(parts).length <= 100_000, "The message text exceeds the size limit.");
export function inputSummary(parts: readonly ModelInputPart[]): string {
  return modelInputText(parts).trim() || parts.flatMap(part => part.kind === "file" ? [part.filename ?? part.mediaType] : []).join(", ");
}
