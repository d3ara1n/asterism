import { useEffect, useRef, useState } from "react";
import { IslandPanel, useI18n, useRendererCalls, useRendererCloseGuard } from "@asterism-app/sdk/renderer";
import type { ResourceRef, UiText } from "@asterism-app/sdk/contracts";
import { Save, Search } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { TextEditor, type TextEditorHandle } from "../editor/TextEditor";
import { parseEditorText, serializeEditorText } from "../editor/text-format";
import { editorMessages as messages } from "../messages/editor";
import { ReadDirectoryGitBase, SaveDirectoryText } from "./editor-contract";

/** The island owns the editing session; its source card can unmount without discarding the buffer. */
export default function FileEditor({ resource, path, text }: { resource: ResourceRef; path: string; text: string }) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const [initial] = useState(() => parseEditorText(text));
  const [content, setContent] = useState(initial.content);
  const [saved, setSaved] = useState(initial.content);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<UiText | null>(null);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const editor = useRef<TextEditorHandle>(null);
  const [gitBase, setGitBase] = useState<string | null>(null);
  const [gitFailed, setGitFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(ReadDirectoryGitBase, { path }, { object: resource, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setGitBase(result.text === null ? null : parseEditorText(result.text).content);
      setGitFailed(false);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      console.error("Editor Git baseline could not be read.", failure);
      setGitBase(null); setGitFailed(true);
    });
    return () => controller.abort();
  }, [calls, resource, path, saved]);
  const dirty = content !== saved;
  useRendererCloseGuard(() => !pending.current);
  const save = async () => {
    if (pending.current || !dirty) return;
    pending.current = true;
    setSaving(true); setError(null);
    const submitted = content;
    try {
      await calls.invoke(SaveDirectoryText, { path, text: serializeEditorText(submitted, initial.format) }, { object: resource });
      setSaved(submitted);
    } catch (failure) {
      setError(failureDisplay(failure, messages.saveFailed));
    } finally { pending.current = false; setSaving(false); }
  };
  return <IslandPanel title={path} dirty={dirty} layout="fill" action={<>
    <IconButton label={i18n.text(messages.find)} onClick={() => editor.current?.find()}><Search /></IconButton>
    <Button size="sm" disabled={!dirty || saving} aria-busy={saving} onClick={() => void save()}>
      {saving ? <Spinner /> : <Save />}{i18n.text(messages.save)}
    </Button>
  </>}>
    {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
    <TextEditor ref={editor} filename={path} initialText={initial.content} gitBase={gitBase}
      onChange={setContent} onSave={() => void save()} onPosition={setPosition}
      onLanguageError={failure => {
        console.error("Editor language support could not be loaded.", failure);
        setError(messages.languageFailed);
      }} />
    <footer className="type-caption flex shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 text-muted-foreground">
      <span role="status">{i18n.text(saving ? commonMessages.statusBusy : dirty ? messages.unsaved : messages.saved)}
        {gitFailed && <> · {i18n.text(messages.gitFailed)}</>}</span>
      <span>{i18n.formatMessage(messages.position, position)} · UTF-8 · {initial.format.lineSeparator === "\r\n" ? "CRLF" : initial.format.lineSeparator === "\r" ? "CR" : "LF"}</span>
    </footer>
  </IslandPanel>;
}
