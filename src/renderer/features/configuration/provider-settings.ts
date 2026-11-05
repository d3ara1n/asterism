import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import { validateProviderSettings } from "../../../shared/provider-settings";

/** Project declared fields, using choice defaults and empty text for fields not yet saved. */
export function settingValues(settings: readonly ProviderSetting[] | undefined, saved: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries((settings ?? []).map(setting =>
    [setting.key, saved[setting.key] ?? (setting.kind === "choice" ? setting.default : "")]));
}

/** Draft completeness and backend persistence use the same field rules. */
export function settingsComplete(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>): boolean {
  return validateProviderSettings(settings, values) !== null;
}
