import { CreationForm } from "../shared/creation-form";
import { Field, FieldLabel, FieldError } from "@asterism/ui/ui/field";

import { Input } from "@asterism/ui/ui/input";
import { Button } from "@asterism/ui/ui/button";

import { commonMessages } from "../messages/common";
import { filesystemMessages } from "../messages/filesystem";
import { useI18n, useRendererCalls, type CreationInputProps } from "@asterism/sdk/renderer";
import { useEffect, useState } from "react";
import { ReadDirectoryDefaults } from "./contract";

/** 路径示例按平台给出；仅作提示，不参与校验。 */
const pathPlaceholder = () => window.host.platform === "win32" ? "C:\\Users\\me\\project"
  : window.host.platform === "darwin" ? "/Users/me/project" : "/home/me/project";

/** 目录创建：手填路径或系统选择，名称回落与路径校验由运行时处理。 */
export function DirectoryInput({ initialInput, busy, resolve, cancel }: CreationInputProps<{ path: string; title?: string }>) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const [path, setPath] = useState(initialInput?.path ?? "");
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [loading, setLoading] = useState(initialInput?.path === undefined);
  const [browsing, setBrowsing] = useState(false);
  const [pathError, setPathError] = useState<import("@asterism/sdk/contracts").UiText | null>(null);
  useEffect(() => {
    if (initialInput?.path !== undefined) return;
    const controller = new AbortController();
    void calls.invoke(ReadDirectoryDefaults, {}, { signal: controller.signal }).then(defaults => {
      if (!controller.signal.aborted) setPath(defaults.path);
    }).catch(error => {
      if (!controller.signal.aborted) setPathError(String(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [calls, initialInput?.path]);
  const browse = async () => {
    setBrowsing(true);
    setPathError(null);
    try {
      const picked = await window.host.pickDirectory();
      if (picked) setPath(picked);
    } catch {
      setPathError(filesystemMessages.directoryBrowseFailed);
    } finally { setBrowsing(false); }
  };
  return <CreationForm busy={busy} disabled={loading || browsing} onCancel={cancel}
    onSubmit={() => resolve({ path: path.trim(), ...(title.trim() ? { title: title.trim() } : {}) })}>
    <Field>
      <FieldLabel htmlFor="directory-title">{i18n.formatMessage(commonMessages.name)}</FieldLabel>
      <Input id="directory-title" autoFocus maxLength={160} value={title} placeholder={i18n.formatMessage(filesystemMessages.directoryTitlePlaceholder)} onChange={e => setTitle(e.target.value)} />
    </Field>
    <Field>
      <FieldLabel htmlFor="directory-path">{i18n.formatMessage(filesystemMessages.absolutePath)}</FieldLabel>
      <div className="flex gap-2">
        <Input id="directory-path" maxLength={4096} spellCheck={false} autoComplete="off" disabled={loading}
          aria-invalid={!!pathError} aria-describedby={pathError ? "directory-path-error" : undefined}
          value={path} onChange={e => { setPath(e.target.value); setPathError(null); }} placeholder={pathPlaceholder()} />
        <Button type="button" variant="secondary" disabled={loading || browsing} onClick={() => { void browse(); }}>{i18n.formatMessage(filesystemMessages.browse)}</Button>
      </div>
      {pathError && <FieldError id="directory-path-error">{i18n.text(pathError)}</FieldError>}
    </Field>
  </CreationForm>;
}
