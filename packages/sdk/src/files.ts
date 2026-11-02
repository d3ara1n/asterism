import { z } from "zod";
import { jsonSchema } from "./json.ts";

/** A self-contained address resolved by its source resource when consumed. References are ordinary, freely constructible JSON. */
export const fileRefSchema = z.strictObject({
  source: z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) })
    .describe("Full identity of the resource providing the content, including its session."),
  locator: jsonSchema.describe("Location interpreted by the source resource's file provider."),
}).describe("FileRef: a source resource and a provider-defined locator identifying content fetched when consumed.");
export type FileRef = z.infer<typeof fileRefSchema>;

/** Descriptive metadata travels with a reference; it does not freeze the source content. */
export const fileReferencePartSchema = z.strictObject({
  kind: z.literal("file-reference"),
  ref: fileRefSchema,
  filename: z.string().min(1).max(255).optional().describe("Name used for delivery."),
  mediaType: z.string().optional().describe("Descriptive MIME type; the reference does not freeze the source content."),
  size: z.number().int().nonnegative().optional().describe("Byte size observed when the reference was described."),
}).describe("A FileRef with optional delivery metadata.");
export type FileReferencePart = z.infer<typeof fileReferencePartSchema>;
