import { useState } from "react";
import type { WorkbenchCommand } from "../../../shared/workbench";
import type { ResourcePlacement } from "./placement";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Field, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Spinner } from "../../shared/ui/spinner";
import { t } from "../../shared/i18n";

/** 路径示例按平台给出；仅作提示，不参与校验。 */
const pathPlaceholder = window.weft.platform === "win32" ? "C:\\Users\\me\\project"
  : window.weft.platform === "darwin" ? "/Users/me/project" : "/home/me/project";

/** 目录资源只记录绝对路径引用；链接到代理后才提供 list/read 与 AGENTS.md。 */
export function AddDirectoryDialog({ creation, busy, error, run, onClose }: {
  creation: ResourcePlacement; busy: boolean; error?: string | null;
  run: (command: WorkbenchCommand) => Promise<boolean>; onClose: () => void;
}) {
  const [path, setPath] = useState("");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t.addDirectoryTitle}</DialogTitle>
        <DialogDescription>{t.addDirectoryDescription}</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <form className="flex flex-col gap-5" onSubmit={event => {
        event.preventDefault();
        void run({ type: "directory.add", sessionId: creation.sessionId, path: path.trim(), position: creation.position })
          .then(saved => { if (saved) onClose(); });
      }}>
        <Field>
          <FieldLabel htmlFor="directory-path">{t.absolutePath}</FieldLabel>
          <Input id="directory-path" autoFocus required maxLength={4096} spellCheck={false} autoComplete="off"
            value={path} onChange={e => setPath(e.target.value)} placeholder={pathPlaceholder} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button disabled={busy || !path.trim()} aria-busy={busy}>{busy && <Spinner aria-hidden="true" />}{busy ? t.creating : t.create}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
