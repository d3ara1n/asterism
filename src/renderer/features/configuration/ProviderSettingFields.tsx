import { useId } from "react";
import type { ProviderSetting } from "@asterism-app/sdk/contracts";
import type { CredentialState } from "../../../shared/configuration";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@asterism-app/ui/ui/field";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { ChoiceField, TextField } from "./forms";
import { CredentialField } from "./CredentialField";
import { keepCredentialDraft, type CredentialDraft } from "./provider-settings";

type ChoiceSetting = Extract<ProviderSetting, { kind: "choice" }>;
/** Choices with few options render as described radio cards; longer lists use a select. */
const radioOptionLimit = 4;

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
  drafts: Readonly<Record<string, CredentialDraft>>;
  onDraft(key: string, draft: CredentialDraft): void;
  /** Saved secret states; undefined before the first save. */
  secretStates: Readonly<Record<string, CredentialState>> | undefined;
  storageAvailable: boolean;
}) {
  const i18n = useI18n();
  const optional = i18n.text(providersMessages.optional);
  return <>{settings.map(setting => {
    const description = setting.description && i18n.text(setting.description);
    if (setting.kind === "secret") return <CredentialField key={setting.key} label={i18n.text(setting.label)}
      required={setting.required} description={description} credentialState={secretStates?.[setting.key]}
      storageAvailable={storageAvailable} keyUrl={setting.helpUrl}
      draft={drafts[setting.key] ?? keepCredentialDraft} onDraftChange={draft => onDraft(setting.key, draft)} />;
    if (setting.kind === "choice") return <ChoiceSettingField key={setting.key} setting={setting}
      value={values[setting.key] ?? setting.default} onChange={value => onValue(setting.key, value)} />;
    return <TextField key={setting.key} label={setting.required ? i18n.text(setting.label) : `${i18n.text(setting.label)} · ${optional}`}
      value={values[setting.key] ?? ""} required={setting.required} hint={description}
      placeholder={setting.placeholder && i18n.text(setting.placeholder)} onChange={value => onValue(setting.key, value)} />;
  })}</>;
}
