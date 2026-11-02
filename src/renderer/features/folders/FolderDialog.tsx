import { useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { folderColors, type Folder, type FolderColor } from "../../../shared/folders";
import { folderMessages } from "../../../shared/folder-messages";
import { useI18n } from "../../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { ColorSwatch, SwatchGroup } from "@asterism-app/ui/ui/swatch";
import { useFolders } from "./context";
import { nextFolderColor } from "./grouping";
import { folderColorLabels, folderDotClass } from "./marks";

/** Creates a folder when `folder` is absent, otherwise edits it. `onSaved` receives the folder identity. */
export function FolderDialog({ folder, onSaved, onClose, onRestoreFocus }: {
  folder?: Folder; onSaved?: (id: string) => void; onClose: () => void; onRestoreFocus?: () => void;
}) {
  const i18n = useI18n();
  const { folders, run, ready } = useFolders();
  const id = useId();
  const pending = useRef(false);
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<FolderColor>(folder?.color ?? nextFolderColor(folders));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current || !ready || !name.trim()) return;
    pending.current = true; setSaving(true); setError(null);
    const folderId = folder?.id ?? crypto.randomUUID();
    try {
      const failure = await run({ type: folder ? "folder.update" : "folder.create", id: folderId, name, color });
      if (failure) { setError(failure); return; }
      onSaved?.(folderId); onClose();
    } finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving} onCloseAutoFocus={event => { if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); } }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(folder ? folderMessages.edit : folderMessages.create)}</DialogTitle>
        <DialogDescription>{i18n.text(folder ? folderMessages.editDescription : folderMessages.createDescription)}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <Field>
          <FieldLabel htmlFor={id}>{i18n.text(folderMessages.name)}</FieldLabel>
          <Input id={id} value={name} required maxLength={80} disabled={saving} autoFocus
            onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }} />
        </Field>
        <fieldset className="min-w-0" disabled={saving}>
          <legend className="type-label mb-2">{i18n.text(folderMessages.color)}</legend>
          <SwatchGroup value={color} onValueChange={value => setColor(value as FolderColor)} aria-label={i18n.text(folderMessages.color)}>
            {folderColors.map(token => <ColorSwatch key={token} value={token} label={i18n.text(folderColorLabels[token])}>
              <span className={`absolute inset-0 ${folderDotClass(token)}`} />
            </ColorSwatch>)}
          </SwatchGroup>
        </fieldset>
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
          <Button type="submit" disabled={saving || !ready || !name.trim()}>
            {saving && <Spinner />}{i18n.text(saving ? formsMessages.saving : formsMessages.save)}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** Deleting a folder keeps its members; they move to no folder. */
export function DeleteFolder({ folder, onClose, onRestoreFocus }: { folder: Folder; onClose: () => void; onRestoreFocus?: () => void }) {
  const i18n = useI18n();
  const { run, ready } = useFolders();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try {
      const failure = await run({ type: "folder.delete", id: folder.id });
      if (failure) setError(failure); else onClose();
    } finally { setBusy(false); }
  };
  return <AlertDialog open onOpenChange={open => { if (!open && !busy) { onClose(); onRestoreFocus?.(); } }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{i18n.text(folderMessages.delete)}</AlertDialogTitle>
        <AlertDialogDescription>{i18n.formatMessage(folderMessages.deleteDescription, { name: folder.name })}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{i18n.text(commonMessages.cancel)}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy || !ready} aria-busy={busy}
          onClick={event => { event.preventDefault(); void remove(); }}>
          {busy && <Spinner />}{i18n.text(folderMessages.delete)}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
