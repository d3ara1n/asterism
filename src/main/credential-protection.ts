import { safeStorage } from "electron";
import { credentialRequestSchema } from "../shared/credential-protection.ts";

export async function protectRuntimeCredential(raw: unknown) {
  const parsed = credentialRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { id, operation, value } = parsed.data;
  let result: string | null = null;
  try {
    if (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text") {
      result = operation === "protect"
        ? (await safeStorage.encryptStringAsync(value)).toString("base64")
        : (await safeStorage.decryptStringAsync(Buffer.from(value, "base64"))).result;
    }
  } catch { /* The runtime receives a fixed error, never credential values or keychain diagnostics. */ }
  return { kind: "credential.response", id, value: result };
}
