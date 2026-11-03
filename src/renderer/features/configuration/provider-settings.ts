import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import type { CredentialState } from "../../../shared/configuration";
import { validateProviderSettings, type CredentialUpdate } from "../../../shared/provider-settings";

export interface CredentialDraft {
  action: "keep" | "replace" | "clear";
  key: string;
}
export const keepCredentialDraft: CredentialDraft = { action: "keep", key: "" };

/** Blank replacement inputs retain the saved credential; clear is an explicit action. */
export function credentialUpdate(draft: CredentialDraft): CredentialUpdate {
  if (draft.action === "clear") return { action: "clear" };
  const value = draft.key.trim();
  return draft.action === "replace" && value ? { action: "replace", value } : { action: "keep" };
}
export const credentialChanged = (draft: CredentialDraft): boolean => credentialUpdate(draft).action !== "keep";

/** Submitted secret changes use the same normalization for every provider family. */
export function secretUpdates(drafts: Readonly<Record<string, CredentialDraft>>): Record<string, CredentialUpdate> {
  return Object.fromEntries(Object.entries(drafts).flatMap(([key, draft]) => {
    const update = credentialUpdate(draft);
    return update.action === "keep" ? [] : [[key, update]];
  }));
}

/** Project declared plain fields, using choice defaults and empty text for fields not yet saved. */
export function settingValues(settings: readonly ProviderSetting[] | undefined, saved: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries((settings ?? []).flatMap(setting => setting.kind === "secret" ? []
    : [[setting.key, saved[setting.key] ?? (setting.kind === "choice" ? setting.default : "")]]));
}

/** Draft completeness and backend persistence use the same field and credential rules. */
export function settingsComplete(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>,
  drafts: Readonly<Record<string, CredentialDraft>>, saved: Readonly<Record<string, CredentialState>> | undefined): boolean {
  const available = new Set(Object.entries(saved ?? {}).flatMap(([key, state]) => state === "available" ? [key] : []));
  return validateProviderSettings(settings, values, secretUpdates(drafts), available) !== null;
}
