import type { ProviderSetting } from "@asterism-app/sdk/contracts";

/**
 * Validate declared settings and return the values to persist.
 * Text and secret values are trimmed and required ones must be nonempty; unsubmitted choices follow their declared defaults.
 */
export function validateProviderSettings(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>): Record<string, string> | null {
  const declared = new Map(settings.map(setting => [setting.key, setting]));
  if (Object.keys(values).some(key => !declared.has(key))) return null;
  const result: Record<string, string> = {};
  for (const setting of settings) {
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
