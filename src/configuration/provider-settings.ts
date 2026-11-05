import type { ProviderSetting, UiText } from "@asterism-app/sdk/contracts";

const plainText = (text: UiText) => typeof text === "string" ? text : text.defaultMessage;

/** A saved value the current declaration cannot use; callers map the reason to their domain error. */
export class ProviderSettingError extends Error {
  constructor(readonly reason: "unsupported" | "missing", readonly key: string, message: string) { super(message); }
}

/**
 * Resolve saved values against the current declaration.
 * Missing choices use their declared default; secrets pass through `resolve`, which runs credential commands;
 * required values must be present; unset optional values are absent.
 */
export async function resolveProviderSettings(settings: readonly ProviderSetting[], saved: Readonly<Record<string, string>>,
  resolve: (value: string) => Promise<string>): Promise<Record<string, string>> {
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
    const value = saved[setting.key]?.trim();
    if (value) values[setting.key] = setting.kind === "secret" ? await resolve(value) : value;
    else if (setting.required) throw new ProviderSettingError("missing", setting.key, `Setting '${label}' is required.`);
  }
  return values;
}
