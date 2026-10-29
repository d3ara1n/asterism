import { useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { SessionResult } from "../../../shared/session";
import { errorDisplay } from "../../../shared/error-display";
import { appMessages } from "../../messages/app";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";

/** The draft takes the current title only when opened; subsequent automatic naming and view refreshes do not overwrite user input. */
export function RenameSession({ title, disabled, onSave, onClose, onRestoreFocus }: {
  title: string; disabled: boolean; onSave: (title: string) => Promise<SessionResult>;
  onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const id = useId();
  const pending = useRef(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current || disabled || !draft.trim()) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await onSave(draft);
      if (result.ok) onClose();
      else setError(errorDisplay(result.error));
    } catch { setError(commonMessages.connectionLost); }
    finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(appMessages.renameConversation)}</DialogTitle>
        <DialogDescription>{i18n.text(appMessages.renameConversationDescription)}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <Field>
          <FieldLabel htmlFor={id}>{i18n.text(appMessages.conversationTitle)}</FieldLabel>
          <Input id={id} value={draft} required maxLength={160} disabled={saving}
            onFocus={event => event.currentTarget.select()}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }} />
        </Field>
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
          <Button type="submit" disabled={saving || disabled || !draft.trim()}>{i18n.text(saving ? formsMessages.saving : formsMessages.save)}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
