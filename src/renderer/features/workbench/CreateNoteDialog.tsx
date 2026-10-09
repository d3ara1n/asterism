import { useState } from "react";
import type { Command, Point } from "../../../shared/contracts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Field, FieldGroup, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { t } from "../../shared/i18n";

export type NoteCreation = { taskId: string; position: Point };
export function CreateNoteDialog({ creation, busy, run, onClose }: {
  creation: NoteCreation; busy: boolean; run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{t.createNoteTitle}</DialogTitle><DialogDescription>{t.createNoteDescription}</DialogDescription></DialogHeader>
    <form onSubmit={event => {
      event.preventDefault();
      const command: Command = { type: "note.create", session_id: creation.taskId, title, content, position: creation.position };
      void run(command).then(saved => { if (saved) onClose(); });
    }} className="flex flex-col gap-5">
      <FieldGroup><Field><FieldLabel htmlFor="create-name">{t.name}</FieldLabel><Input id="create-name" autoFocus required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="create-content">{t.content}</FieldLabel><Textarea id="create-content" required maxLength={100_000} value={content} onChange={e => setContent(e.target.value)} rows={7} /></Field></FieldGroup>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button><Button disabled={busy || !title.trim() || !content.trim()}>{t.create}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
