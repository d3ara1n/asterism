import { useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { errorDisplay } from "../../../shared/error-display";
import type { WorkbenchObject } from "../../../shared/workbench";
import { formsMessages } from "../../messages/forms";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useWorkbench } from "./context";

/** The draft takes the title at opening; resource projection updates do not overwrite input being edited. */
export function RenameObject({ object, onClose, onRestoreFocus }: {
  object: WorkbenchObject; onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const { controller, session, ready } = useWorkbench();
  const id = useId();
  const pending = useRef(false);
  const [draft, setDraft] = useState(object.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current || !ready || !draft.trim()) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await controller.execute({ type: "object.rename", sessionId: session.id, objectId: object.id, title: draft });
      if (result.ok) onClose();
      else setError(errorDisplay(result.error));
    } finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(objectsMessages.renameObject)}</DialogTitle>
        <DialogDescription>{i18n.text(objectsMessages.renameObjectDescription)}</DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <FieldGroup><Field>
          <FieldLabel htmlFor={id}>{i18n.text(objectsMessages.objectTitle)}</FieldLabel>
          <Input id={id} value={draft} required maxLength={160} disabled={saving}
            onFocus={event => event.currentTarget.select()}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }} />
        </Field></FieldGroup>
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
          <Button type="submit" disabled={saving || !ready || !draft.trim()}>{i18n.text(saving ? formsMessages.saving : formsMessages.save)}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
