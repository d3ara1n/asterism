import { useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { TemplateSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { errorDisplay } from "../../../shared/error-display";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Spinner } from "@asterism-app/ui/ui/spinner";

export function RenameTemplate({ template, disabled, onSaved, onClose, onRestoreFocus }: {
  template: TemplateSummary; disabled: boolean;
  onSaved: () => void; onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const id = useId();
  const pending = useRef(false);
  const [name, setName] = useState(template.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current || disabled || !name.trim()) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await runtime.session.execute({ type: "template.rename", templateId: template.id, title: name });
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      onSaved(); onClose();
    } catch { setError(commonMessages.connectionLost); }
    finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(templateMessages.rename)}</DialogTitle>
        <DialogDescription>{i18n.text(templateMessages.renameDescription)}</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <FieldGroup className="gap-4">
          <Field data-disabled={saving}>
            <FieldLabel htmlFor={id}>{i18n.text(templateMessages.name)}</FieldLabel>
            <Input id={id} value={name} required maxLength={160} disabled={saving}
              onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
              }} />
          </Field>
          {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
            <Button type="submit" disabled={saving || disabled || !name.trim()} aria-busy={saving}>
              {saving && <Spinner data-icon="inline-start" />}{i18n.text(saving ? formsMessages.saving : formsMessages.save)}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}
