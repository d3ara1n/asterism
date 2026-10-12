import { useState } from "react";
import type { CreationInputProps } from "@atelier/sdk/renderer";
import { Button } from "../../renderer/shared/ui/button";
import { Field, FieldError, FieldLabel } from "../../renderer/shared/ui/field";
import { Input } from "../../renderer/shared/ui/input";
import { CreationForm } from "../../renderer/shared/creation-form";
import { s, t } from "../../renderer/shared/i18n";

/** 路径示例按平台给出；仅作提示，不参与校验。 */
const pathPlaceholder = () => window.host.platform === "win32" ? "C:\\Users\\me\\project"
  : window.host.platform === "darwin" ? "/Users/me/project" : "/home/me/project";

/** 目录创建：手填路径或系统选择，名称回落与路径校验由运行时处理。 */
export function DirectoryInput({ initialInput, busy, resolve, cancel }: CreationInputProps<{ path: string; title?: string }>) {
  const [path, setPath] = useState(initialInput?.path ?? "");
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browse = async () => {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const picked = await window.host.pickDirectory();
      if (picked) setPath(picked);
    } catch {
      setBrowseError(t.directoryBrowseFailed);
    } finally { setBrowsing(false); }
  };
  return <CreationForm busy={busy || browsing} onCancel={cancel}
    onSubmit={() => resolve({ path: path.trim(), ...(title.trim() ? { title: title.trim() } : {}) })}>
    <Field>
      <FieldLabel htmlFor="directory-title">{t.name}</FieldLabel>
      <Input id="directory-title" autoFocus maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
    </Field>
    <Field>
      <FieldLabel htmlFor="directory-path">{t.absolutePath}</FieldLabel>
      <div className="flex gap-2">
        <Input id="directory-path" maxLength={4096} spellCheck={false} autoComplete="off"
          aria-invalid={!!browseError} aria-describedby={browseError ? "directory-path-error" : undefined}
          value={path} onChange={e => setPath(e.target.value)} placeholder={pathPlaceholder()} />
        <Button type="button" variant="secondary" onClick={() => { void browse(); }}>{s("Browse…", "浏览…")}</Button>
      </div>
      {browseError && <FieldError id="directory-path-error">{browseError}</FieldError>}
    </Field>
  </CreationForm>;
}
