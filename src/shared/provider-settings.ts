import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import { z } from "zod";

export const credentialUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("keep") }),
  z.strictObject({ action: z.literal("clear") }),
  z.strictObject({ action: z.literal("replace"), value: z.string().trim().min(1).max(16_384) }),
]);
export type CredentialUpdate = z.infer<typeof credentialUpdateSchema>;

/** Required credentials must be retained from a saved value or supplied by a valid replacement. */
export function credentialComplete(required: boolean, update: CredentialUpdate, saved: boolean): boolean {
  if (update.action === "replace") return credentialUpdateSchema.safeParse(update).success;
  return !required || update.action === "keep" && saved;
}

/**
 * Validate declared settings and return the plain values to persist.
 * Unsubmitted choices follow their declared defaults; secrets remain separate from plain values.
 */
export function validateProviderSettings(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, CredentialUpdate>>, savedSecretKeys: ReadonlySet<string>): Record<string, string> | null {
  const declared = new Map(settings.map(setting => [setting.key, setting]));
  if (Object.keys(values).some(key => declared.get(key)?.kind === "secret" || !declared.has(key))) return null;
  if (Object.keys(secrets).some(key => declared.get(key)?.kind !== "secret")) return null;
  const result: Record<string, string> = {};
  for (const setting of settings) {
    if (setting.kind === "secret") {
      if (!credentialComplete(setting.required, secrets[setting.key] ?? { action: "keep" }, savedSecretKeys.has(setting.key))) return null;
      continue;
    }
    const value = values[setting.key];
    if (setting.kind === "choice") {
      if (value === undefined) continue;
      if (!setting.options.some(option => option.value === value)) return null;
      result[setting.key] = value;
      continue;
    }
    const text = value?.trim() ?? "";
    if (setting.required && !text) return null;
    if (text) result[setting.key] = text;
  }
  return result;
}
