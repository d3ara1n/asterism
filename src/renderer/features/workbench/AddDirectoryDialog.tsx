import { useState } from "react";
import type { Command } from "../../../shared/contracts";
import type { NoteCreation } from "./CreateNoteDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Field, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { t } from "../../shared/i18n";
import { s } from "../configuration/state";

/** 目录资源只记录绝对路径引用；链接到代理后才提供 list/read 与 AGENTS.md。 */
export function AddDirectoryDialog({ creation, busy, run, onClose }: {
  creation: NoteCreation; busy: boolean; run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const [path, setPath] = useState("");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader>
    <DialogTitle>{s("Add directory", "添加目录")}</DialogTitle>
    <DialogDescription>{s("Adds a reference to a local directory. Link it to an agent to grant access.", "添加对本地目录的引用；链接到代理后才授予访问。")}</DialogDescription>
  </DialogHeader>
    <form className="flex flex-col gap-5" onSubmit={event => {
      event.preventDefault();
      void run({ type: "directory.add", session_id: creation.taskId, path: path.trim(), position: creation.position }).then(saved => { if (saved) onClose(); });
    }}>
      <Field><FieldLabel htmlFor="directory-path">{s("Absolute path", "绝对路径")}</FieldLabel>
        <Input id="directory-path" autoFocus required maxLength={4096} value={path} onChange={e => setPath(e.target.value)} placeholder="/Users/me/project" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
        <Button disabled={busy || !path.trim()}>{t.create}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
