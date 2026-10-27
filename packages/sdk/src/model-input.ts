import { z } from "zod";
import { contentRefSchema } from "./content.ts";

/** mediaType is the MIME type truthfully identified by the client and sent with the bytes; the client does not infer model capabilities from it, and acceptance is determined by server feedback. */
export const mediaTypeSchema = z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/);

/** Model input contains only text and files; files store immutable content identity and consumption metadata, while bytes and read eligibility stay outside messages. */
export const modelInputPartSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string() }),
  z.strictObject({ kind: z.literal("file"), file: contentRefSchema,
    mediaType: mediaTypeSchema, filename: z.string().min(1).max(255).optional() }),
]);
export type ModelInputPart = z.infer<typeof modelInputPartSchema>;
export type ModelFilePart = Extract<ModelInputPart, { kind: "file" }>;
export const modelInputPartsSchema = z.array(modelInputPartSchema).min(1);
/** Plain-text consumers explicitly extract the body without implicitly reading files. */
export function modelInputText(parts: readonly (Extract<ModelInputPart, { kind: "text" }> | { kind: "file" })[]): string {
  return parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
}
