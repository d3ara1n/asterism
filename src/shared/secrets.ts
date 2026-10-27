import { z } from "zod";

/** Used only between main and task processes, never through the renderer bridge. */
export const secretRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ kind: z.literal("secret.request"), id: z.string().uuid(), action: z.literal("available") }),
  z.strictObject({ kind: z.literal("secret.request"), id: z.string().uuid(), action: z.literal("encrypt"), value: z.string().max(16_384) }),
  z.strictObject({ kind: z.literal("secret.request"), id: z.string().uuid(), action: z.literal("decrypt"), value: z.string().max(100_000) }),
]);
export const secretResponseSchema = z.strictObject({
  kind: z.literal("secret.response"), id: z.string().uuid(), ok: z.boolean(), value: z.union([z.string(), z.boolean()]).optional(),
});
export interface SecretProtector {
  available(): Promise<boolean>;
  encrypt(value: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}
