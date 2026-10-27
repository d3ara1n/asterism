import type { CredentialState } from "../../../shared/configuration";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldDescription, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { StatusText } from "@asterism-app/ui/ui/status";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { ChoiceField } from "./forms";

export interface ConnectionCredentialDraft {
  action: "keep" | "replace" | "clear";
  key: string;
}

/** Compose authentication controls by method; a fixed method still allows entering, replacing, and clearing credentials. */
export function ConnectionAuthentication({ auth, editable, credentialState, storageAvailable, draft, onAuthChange, onDraftChange }: {
  auth: "api_key" | "none";
  editable: boolean;
  credentialState?: CredentialState;
  storageAvailable: boolean;
  draft: ConnectionCredentialDraft;
  onAuthChange(auth: "api_key" | "none"): void;
  onDraftChange(draft: ConnectionCredentialDraft): void;
}) {
  const i18n = useI18n();
  const storedKey = credentialState === "available";
  const credentialLabels = {
    not_required: providersMessages.noAuthentication,
    missing: providersMessages.noKeySaved,
    available: providersMessages.keySaved,
    storage_unavailable: providersMessages.credentialProtectionUnavailable,
    decryption_failed: providersMessages.decryptionFailed,
  };
  return <>
    {editable && <ChoiceField label={i18n.text(providersMessages.authentication)} value={auth}
      options={[{ value: "api_key", label: i18n.text(commonMessages.apiKey) }, { value: "none", label: i18n.text(providersMessages.noAuthenticationOption) }]}
      onChange={next => { if (next === "api_key" || next === "none") onAuthChange(next); }} />}
    {auth === "api_key" && <Field>
      <FieldLabel htmlFor="provider-api-key">{i18n.text(commonMessages.apiKey)}</FieldLabel>
      <Input id="provider-api-key" type="password" autoComplete="off" autoFocus={credentialState === undefined && !editable}
        value={draft.key} disabled={draft.action === "clear"}
        onChange={event => onDraftChange({ action: "replace", key: event.target.value })}
        placeholder={i18n.text(storedKey ? providersMessages.keepSavedKey : providersMessages.pasteApiKey)} />
      <FieldDescription>
        {draft.action === "clear" ? <StatusText tone="warning">{i18n.text(providersMessages.keyRemovalHint)}</StatusText>
          : credentialState === "storage_unavailable" || credentialState === "decryption_failed"
            ? <StatusText tone="error">{i18n.text(credentialLabels[credentialState])}</StatusText>
          : i18n.text(credentialState ? credentialLabels[credentialState] : providersMessages.keyStorageHint)}
        {storedKey && <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
          onClick={() => onDraftChange({ key: "", action: draft.action === "clear" ? "keep" : "clear" })}>
          {i18n.text(draft.action === "clear" ? providersMessages.undo : providersMessages.removeSavedKey)}
        </Button>}
      </FieldDescription>
      {!storageAvailable && <Alert variant="destructive"><AlertDescription>{i18n.text(providersMessages.encryptionUnavailable)}</AlertDescription></Alert>}
    </Field>}
  </>;
}
