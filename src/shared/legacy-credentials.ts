import { z } from "zod";

/** One-time decryption between data preparation and main; normal runtime never uses this channel. */
export const legacyCredentialRequestSchema = z.strictObject({
  kind: z.literal("credential.migrate"), id: z.string().uuid(), ciphertext: z.string(),
});
export const legacyCredentialResponseSchema = z.strictObject({
  kind: z.literal("credential.migrated"), id: z.string().uuid(), value: z.string().nullable(),
});
