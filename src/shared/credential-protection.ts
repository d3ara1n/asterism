import { z } from "zod";

export interface CredentialProtection {
  protect(value: string): Promise<string>;
  unprotect(value: string): Promise<string>;
}

export const credentialRequestSchema = z.strictObject({
  kind: z.literal("credential.request"), id: z.uuid(), operation: z.enum(["protect", "unprotect"]), value: z.string(),
});
export const credentialResponseSchema = z.strictObject({
  kind: z.literal("credential.response"), id: z.uuid(), value: z.string().nullable(),
});
