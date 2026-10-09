import { useState } from "react";
import type { WorkbenchCommand } from "../../../shared/workbench";
import type { ResourcePlacement } from "./placement";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Field, FieldGroup, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { Spinner } from "../../shared/ui/spinner";
import { t } from "../../shared/i18n";

export function CreateNoteDialog({ creation, busy, error, run, onClose }: {
  creation: ResourcePlacement; busy: boolean; error?: string | null;
  run: (command: WorkbenchCommand) => Promise<boolean>; onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t.createNoteTitle}</DialogTitle>
        <DialogDescription>{t.createNoteDescription}</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <form className="flex flex-col gap-5" onSubmit={event => {
        event.preventDefault();
        void run({ type: "note.create", sessionId: creation.sessionId, title, content, position: creation.position })
          .then(saved => { if (saved) onClose(); });
      }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-name">{t.name}</FieldLabel>
            <Input id="create-name" autoFocus required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-content">{t.content}</FieldLabel>
            <Textarea id="create-content" required maxLength={100_000} rows={7}
              value={content} onChange={e => setContent(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button disabled={busy || !title.trim() || !content.trim()} aria-busy={busy}>{busy && <Spinner aria-hidden="true" />}{busy ? t.creating : t.create}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
