import { safeStorage } from "electron";
import { secretRequestSchema } from "../shared/secrets.ts";

/** 系统保护不可用或 Linux 回退到 basic_text 时明确拒绝，不提供明文后备。 */
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
    // 加密异常可能包含用户信息；不记录原始异常或明文。
    return { ...response, ok: false };
  }
}
