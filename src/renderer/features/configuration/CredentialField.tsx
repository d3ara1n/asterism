import { useId } from "react";
import type { CredentialState } from "../../../shared/configuration";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldDescription, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { StatusText } from "@asterism-app/ui/ui/status";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { ProviderKeyLink } from "./ProviderKeyLink";
import type { CredentialDraft } from "./provider-settings";

/**
 * Shared secret input: enter, keep, replace, or clear an optional saved credential.
 * credentialState is undefined before the first save.
 */
export function CredentialField({ label, required, description, credentialState, storageAvailable, keyUrl, draft, onDraftChange }: {
  label: string;
  required: boolean;
  description?: string;
  credentialState?: CredentialState;
  storageAvailable: boolean;
  keyUrl?: string;
  draft: CredentialDraft;
  onDraftChange(draft: CredentialDraft): void;
}) {
  const i18n = useI18n(), id = useId();
  const storedKey = credentialState === "available";
  const credentialLabels = {
    not_required: providersMessages.noAuthentication,
    missing: providersMessages.noCredentialSaved,
    available: providersMessages.credentialSaved,
    storage_unavailable: providersMessages.credentialProtectionUnavailable,
    decryption_failed: providersMessages.decryptionFailed,
  };
  return <Field>
    <FieldLabel htmlFor={id}>{label}{!required && <span className="font-normal text-muted-foreground">{i18n.text(providersMessages.optional)}</span>}</FieldLabel>
    <Input id={id} type="password" autoComplete="off" required={required && !storedKey}
      value={draft.key} disabled={draft.action === "clear"}
      onChange={event => onDraftChange({ action: "replace", key: event.target.value })}
      placeholder={i18n.text(storedKey ? providersMessages.keepSavedCredential : providersMessages.enterCredential)} />
    {description && <FieldDescription>{description}</FieldDescription>}
    <FieldDescription>
      {draft.action === "clear" ? <StatusText tone="warning">{i18n.text(providersMessages.credentialRemovalHint)}</StatusText>
        : credentialState === "storage_unavailable" || credentialState === "decryption_failed"
          ? <StatusText tone="error">{i18n.text(credentialLabels[credentialState])}</StatusText>
        : i18n.text(credentialState ? credentialLabels[credentialState] : providersMessages.credentialStorageHint)}
      {storedKey && !required && <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
        onClick={() => onDraftChange({ key: "", action: draft.action === "clear" ? "keep" : "clear" })}>
        {i18n.text(draft.action === "clear" ? providersMessages.undo : providersMessages.removeSavedCredential)}
      </Button>}
    </FieldDescription>
    {keyUrl && <ProviderKeyLink href={keyUrl}>{i18n.text(providersMessages.getKey)}</ProviderKeyLink>}
    {!storageAvailable && <Alert variant="destructive"><AlertDescription>{i18n.text(providersMessages.encryptionUnavailable)}</AlertDescription></Alert>}
  </Field>;
}
