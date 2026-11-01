import type { ProviderSetting, UiText } from "@asterism-app/sdk/contracts";

export type CredentialUpdate = { action: "keep" } | { action: "clear" } | { action: "replace"; value: string };
const plainText = (text: UiText) => typeof text === "string" ? text : text.defaultMessage;

/** A saved value the current declaration cannot use; callers map the reason to their domain error. */
export class ProviderSettingError extends Error {
  constructor(readonly reason: "unsupported" | "missing", readonly key: string, message: string) { super(message); }
}

/**
 * Resolve saved values against the current declaration.
 * Missing choices use their declared default; required text and secrets must be present; unset optional values are absent.
 */
export async function resolveProviderSettings(settings: readonly ProviderSetting[], saved: Readonly<Record<string, string>>,
  secret: (key: string) => Promise<string | null>): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const setting of settings) {
    const label = plainText(setting.label);
    if (setting.kind === "choice") {
      const value = saved[setting.key] ?? setting.default;
      if (!setting.options.some(option => option.value === value))
        throw new ProviderSettingError("unsupported", setting.key, `Setting '${label}' has unsupported value '${value}'.`);
      values[setting.key] = value;
      continue;
    }
    const value = setting.kind === "text" ? saved[setting.key]?.trim() || null : await secret(setting.key);
    if (value !== null) values[setting.key] = value;
    else if (setting.required) throw new ProviderSettingError("missing", setting.key, `Setting '${label}' is required.`);
  }
  return values;
}

/**
 * Validate a save command and return the non-secret values to persist.
 * Only declared keys are accepted; required values must be supplied, and required secrets must be kept or replaced.
 * Unsubmitted choices stay unsaved so they follow the declared default.
 */
export function validateProviderSettings(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>,
  secrets: Readonly<Record<string, CredentialUpdate>>, savedSecretKeys: ReadonlySet<string>): Record<string, string> | null {
  const declared = new Map(settings.map(setting => [setting.key, setting]));
  if (Object.keys(values).some(key => declared.get(key)?.kind === "secret" || !declared.has(key))) return null;
  if (Object.keys(secrets).some(key => declared.get(key)?.kind !== "secret")) return null;
  const result: Record<string, string> = {};
  for (const setting of settings) {
    if (setting.kind === "secret") {
      const update = secrets[setting.key] ?? { action: "keep" };
      if (setting.required && (update.action === "clear" || update.action === "keep" && !savedSecretKeys.has(setting.key))) return null;
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

/** Secret keys a snapshot reports: declared secrets, or saved references when the type is unavailable. */
export function reportedSecretKeys(settings: readonly ProviderSetting[] | undefined, refs: Readonly<Record<string, string>>): string[] {
  return settings ? settings.filter(setting => setting.kind === "secret").map(setting => setting.key) : Object.keys(refs);
}
