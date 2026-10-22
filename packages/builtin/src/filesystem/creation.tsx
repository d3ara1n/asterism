import { CreationForm } from "../shared/creation-form";
import { Field, FieldLabel, FieldError } from "@atelier/ui/ui/field";

import { Input } from "@atelier/ui/ui/input";
import { Button } from "@atelier/ui/ui/button";

import { commonMessages } from "../messages/common";
import { filesystemMessages } from "../messages/filesystem";
import { useI18n, type CreationInputProps } from "@atelier/sdk/renderer";
import { useState } from "react";

/** 路径示例按平台给出；仅作提示，不参与校验。 */
const pathPlaceholder = () => window.host.platform === "win32" ? "C:\\Users\\me\\project"
  : window.host.platform === "darwin" ? "/Users/me/project" : "/home/me/project";

/** 目录创建：手填路径或系统选择，名称回落与路径校验由运行时处理。 */
export function DirectoryInput({ initialInput, busy, resolve, cancel }: CreationInputProps<{ path: string; title?: string }>) {
  const i18n = useI18n();
  const [path, setPath] = useState(initialInput?.path ?? "");
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<import("@atelier/sdk/contracts").UiText | null>(null);
  const browse = async () => {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const picked = await window.host.pickDirectory();
      if (picked) setPath(picked);
    } catch {
      setBrowseError(filesystemMessages.directoryBrowseFailed);
    } finally { setBrowsing(false); }
  };
  return <CreationForm busy={busy} disabled={browsing} onCancel={cancel}
    onSubmit={() => resolve({ path: path.trim(), ...(title.trim() ? { title: title.trim() } : {}) })}>
    <Field>
      <FieldLabel htmlFor="directory-title">{i18n.formatMessage(commonMessages.name)}</FieldLabel>
      <Input id="directory-title" autoFocus maxLength={160} value={title} placeholder={i18n.formatMessage(filesystemMessages.directoryTitlePlaceholder)} onChange={e => setTitle(e.target.value)} />
    </Field>
    <Field>
      <FieldLabel htmlFor="directory-path">{i18n.formatMessage(filesystemMessages.absolutePath)}</FieldLabel>
      <div className="flex gap-2">
        <Input id="directory-path" maxLength={4096} spellCheck={false} autoComplete="off"
          aria-invalid={!!browseError} aria-describedby={browseError ? "directory-path-error" : undefined}
          value={path} onChange={e => setPath(e.target.value)} placeholder={pathPlaceholder()} />
        <Button type="button" variant="secondary" disabled={browsing} onClick={() => { void browse(); }}>{i18n.formatMessage(filesystemMessages.browse)}</Button>
      </div>
      {browseError && <FieldError id="directory-path-error">{i18n.text(browseError)}</FieldError>}
    </Field>
  </CreationForm>;
}
