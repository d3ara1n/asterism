import { useId } from "react";
import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import type { CredentialState } from "../../../shared/configuration";
import { webProviderMessages } from "../../messages/web-providers";
import { useI18n } from "../../shared/i18n";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@asterism-app/ui/ui/field";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { ChoiceField, TextField } from "./forms";
import { CredentialField, credentialChanged, type ConnectionCredentialDraft } from "./ConnectionAuthentication";

type ChoiceSetting = Extract<ProviderSetting, { kind: "choice" }>;
/** Choices with few options render as described radio cards; longer lists use a select. */
const radioOptionLimit = 4;
const keepDraft: ConnectionCredentialDraft = { action: "keep", key: "" };

/** Effective non-secret values: saved values where present, otherwise choice defaults and empty text. */
export function settingValues(settings: readonly ProviderSetting[] | undefined, saved: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries((settings ?? []).flatMap(setting => setting.kind === "secret" ? []
    : [[setting.key, saved[setting.key] ?? (setting.kind === "choice" ? setting.default : "")]]));
}
/** Mirrors the save contract: required text is entered, and every required secret is entered now or already saved and kept. */
export function settingsComplete(settings: readonly ProviderSetting[], values: Readonly<Record<string, string>>,
  drafts: Readonly<Record<string, ConnectionCredentialDraft>>, saved: Readonly<Record<string, CredentialState>> | undefined): boolean {
  return settings.every(setting => {
    if (setting.kind === "choice" || !setting.required) return true;
    if (setting.kind === "text") return !!values[setting.key]?.trim();
    const draft = drafts[setting.key] ?? keepDraft;
    return draft.action === "replace" && !!draft.key.trim() || draft.action !== "clear" && saved?.[setting.key] === "available";
  });
}
/** Changed secret drafts as save-command updates; untouched secrets are kept. */
export function secretUpdates(drafts: Readonly<Record<string, ConnectionCredentialDraft>>) {
  return Object.fromEntries(Object.entries(drafts).filter(([, draft]) => credentialChanged(draft))
    .map(([key, draft]) => [key, draft.action === "clear" ? { action: "clear" as const } : { action: "replace" as const, value: draft.key.trim() }]));
}

function ChoiceSettingField({ setting, value, onChange }: { setting: ChoiceSetting; value: string; onChange(value: string): void }) {
  const i18n = useI18n(), id = useId();
  if (setting.options.length > radioOptionLimit) {
    const selected = setting.options.find(option => option.value === value);
    const hint = [setting.description, selected?.description].filter(text => text !== undefined).map(text => i18n.text(text)).join(" ");
    return <ChoiceField label={i18n.text(setting.label)} value={value} hint={hint || undefined}
      options={setting.options.map(option => ({ value: option.value, label: i18n.text(option.label) }))}
      onChange={next => { if (next) onChange(next); }} />;
  }
  return <FieldSet>
    <FieldLegend variant="label">{i18n.text(setting.label)}</FieldLegend>
    {setting.description && <FieldDescription>{i18n.text(setting.description)}</FieldDescription>}
    <RadioGroup value={value} onValueChange={onChange}>
      {setting.options.map(option => <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`} className="w-full">
        <Field orientation="horizontal">
          <RadioGroupItem id={`${id}-${option.value}`} value={option.value}
            aria-describedby={option.description ? `${id}-${option.value}-hint` : undefined} />
          <FieldContent>
            <FieldTitle>{i18n.text(option.label)}</FieldTitle>
            {option.description && <FieldDescription id={`${id}-${option.value}-hint`}>{i18n.text(option.description)}</FieldDescription>}
          </FieldContent>
        </Field>
      </FieldLabel>)}
    </RadioGroup>
  </FieldSet>;
}

/** Render a provider's declared settings in declaration order; secret values stay in drafts until saved. */
export function ProviderSettingFields({ settings, values, onValue, drafts, onDraft, secretStates, storageAvailable }: {
  settings: readonly ProviderSetting[];
  values: Readonly<Record<string, string>>;
  onValue(key: string, value: string): void;
  drafts: Readonly<Record<string, ConnectionCredentialDraft>>;
  onDraft(key: string, draft: ConnectionCredentialDraft): void;
  /** Saved secret states; undefined before the first save. */
  secretStates: Readonly<Record<string, CredentialState>> | undefined;
  storageAvailable: boolean;
}) {
  const i18n = useI18n();
  const optional = i18n.text(webProviderMessages.optional);
  return <>{settings.map(setting => {
    const description = setting.description && i18n.text(setting.description);
    if (setting.kind === "secret") return <CredentialField key={setting.key} label={i18n.text(setting.label)}
      optionalLabel={setting.required ? undefined : optional} description={description} credentialState={secretStates?.[setting.key]}
      storageAvailable={storageAvailable} removable={!setting.required} keyUrl={setting.helpUrl}
      draft={drafts[setting.key] ?? keepDraft} onDraftChange={draft => onDraft(setting.key, draft)} />;
    if (setting.kind === "choice") return <ChoiceSettingField key={setting.key} setting={setting}
      value={values[setting.key] ?? setting.default} onChange={value => onValue(setting.key, value)} />;
    return <TextField key={setting.key} label={setting.required ? i18n.text(setting.label) : `${i18n.text(setting.label)} · ${optional}`}
      value={values[setting.key] ?? ""} required={setting.required} hint={description}
      placeholder={setting.placeholder && i18n.text(setting.placeholder)} onChange={value => onValue(setting.key, value)} />;
  })}</>;
}
