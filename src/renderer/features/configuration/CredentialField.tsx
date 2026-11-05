import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { ProviderKeyLink } from "./ProviderKeyLink";

/** Secret input bound to its saved value: a literal credential or a `!` command. */
export function CredentialField({ label, required, description, keyUrl, value, onChange }: {
  label: string;
  required: boolean;
  description?: string;
  keyUrl?: string;
  value: string;
  onChange(value: string): void;
}) {
  const i18n = useI18n(), id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{label}{!required && <span className="font-normal text-muted-foreground">{i18n.text(providersMessages.optional)}</span>}</FieldLabel>
    <Input id={id} type="password" autoComplete="off" spellCheck={false} required={required}
      value={value} onChange={event => onChange(event.target.value)} />
    {description && <FieldDescription>{description}</FieldDescription>}
    <FieldDescription>{i18n.text(providersMessages.credentialCommandHint)}</FieldDescription>
    {keyUrl && <ProviderKeyLink href={keyUrl}>{i18n.text(providersMessages.getKey)}</ProviderKeyLink>}
  </Field>;
}
