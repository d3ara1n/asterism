import { safeStorage } from "electron";
import { legacyCredentialRequestSchema } from "../shared/legacy-credentials.ts";

/** Only data preparation can decrypt credentials written before configuration v14. */
export async function migrateLegacyCredential(raw: unknown) {
  const parsed = legacyCredentialRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  let value: string | null = null;
  try { value = (await safeStorage.decryptStringAsync(Buffer.from(parsed.data.ciphertext, "base64"))).result; }
  catch { /* System errors can contain sensitive material; report migration failure without their contents. */ }
  return { kind: "credential.migrated" as const, id: parsed.data.id, value };
}
