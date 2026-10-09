import { useState } from "react";
import { Button } from "../../shared/ui/button";
import { Field, FieldError, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { s } from "../configuration/state";
import { t } from "../../shared/i18n";
import { ResourceCreationDialog, type ResourceCreationDialogState } from "./ResourceCreationDialog";

/** 路径示例按平台给出；仅作提示，不参与校验。 */
const pathPlaceholder = window.weft.platform === "win32" ? "C:\\Users\\me\\project"
  : window.weft.platform === "darwin" ? "/Users/me/project" : "/home/me/project";

/** 目录创建表单：手填路径或系统选择，名称回落与路径校验由运行时处理。 */
export function AddDirectoryDialog({ onCreate, busy, ...dialog }: ResourceCreationDialogState & {
  onCreate: (input: { path: string; title?: string }) => Promise<boolean>;
}) {
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browse = async () => {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const picked = await window.weft.pickDirectory();
      if (picked) setPath(picked);
    } catch {
      setBrowseError(t.directoryBrowseFailed);
    } finally { setBrowsing(false); }
  };
  return <ResourceCreationDialog {...dialog} busy={busy || browsing} title={t.addDirectoryTitle} description={t.addDirectoryDescription}
    onCreate={() => onCreate({ path: path.trim(), ...(title.trim() ? { title: title.trim() } : {}) })}>
    <Field>
      <FieldLabel htmlFor="directory-title">{t.name}</FieldLabel>
      <Input id="directory-title" autoFocus maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
    </Field>
    <Field>
      <FieldLabel htmlFor="directory-path">{t.absolutePath}</FieldLabel>
      <div className="flex gap-2">
        <Input id="directory-path" maxLength={4096} spellCheck={false} autoComplete="off"
          aria-invalid={!!browseError} aria-describedby={browseError ? "directory-path-error" : undefined}
          value={path} onChange={e => setPath(e.target.value)} placeholder={pathPlaceholder} />
        <Button type="button" variant="secondary" onClick={() => { void browse(); }}>{s("Browse…", "浏览…")}</Button>
      </div>
      {browseError && <FieldError id="directory-path-error">{browseError}</FieldError>}
    </Field>
  </ResourceCreationDialog>;
}
