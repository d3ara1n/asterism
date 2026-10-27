import { safeStorage } from "electron";
import { secretRequestSchema } from "../shared/secrets.ts";

/** Reject explicitly if system protection is unavailable or Linux falls back to basic_text; no plaintext fallback. */
export async function handleSecretRequest(raw: unknown): Promise<unknown | null> {
  const parsed = secretRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const request = parsed.data;
  const response = { kind: "secret.response" as const, id: request.id };
  try {
    const available = await safeStorage.isAsyncEncryptionAvailable() &&
      (process.platform !== "linux" || !["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend()));
    if (request.action === "available") return { ...response, ok: true, value: available };
    if (!available) return { ...response, ok: false };
    const value = request.action === "encrypt"
      ? (await safeStorage.encryptStringAsync(request.value)).toString("base64")
      : (await safeStorage.decryptStringAsync(Buffer.from(request.value, "base64"))).result;
    return { ...response, ok: true, value };
  } catch {
    // Encryption exceptions may contain user information; do not log raw exceptions or plaintext.
    return { ...response, ok: false };
  }
}
