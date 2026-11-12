import { useRef, useState, type ReactNode } from "react";
import { IslandPanel, useI18n, useRendererCloseGuard } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Save, Search, WrapText } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { TextEditor, type TextEditorHandle } from "./TextEditor";
import { editorMessages as messages } from "../messages/editor";

/** The island owns the buffer; its caller supplies persistence and optional source metadata. */
export function EditorIsland({ title, source, filename, text, onSave, gitBase = null, status, format }: {
  title: string;
  source?: ReactNode;
  filename: string;
  text: string;
  onSave(text: string): Promise<void>;
  gitBase?: string | null;
  status?: ReactNode;
  format?: ReactNode;
}) {
  const i18n = useI18n();
  const [initial] = useState(text);
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [lineWrapping, setLineWrapping] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<UiText | null>(null);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const editor = useRef<TextEditorHandle>(null);
  const dirty = content !== saved;
  useRendererCloseGuard(() => !pending.current);
  const save = async () => {
    if (pending.current || !dirty) return;
    pending.current = true;
    setSaving(true); setError(null);
    const submitted = content;
    try {
      await onSave(submitted);
      setSaved(submitted);
    } catch (failure) {
      setError(failureDisplay(failure, messages.saveFailed));
    } finally { pending.current = false; setSaving(false); }
  };
  return <IslandPanel title={title} source={source} dirty={dirty} layout="fill" action={<>
    <IconButton label={i18n.text(messages.find)} onClick={() => editor.current?.find()}><Search /></IconButton>
    <IconButton label={i18n.text(commonMessages.wordWrap)} aria-pressed={lineWrapping}
      variant={lineWrapping ? "selected" : "ghost"} onClick={() => setLineWrapping(value => !value)}><WrapText /></IconButton>
    <Button size="sm" disabled={!dirty || saving} aria-busy={saving} onClick={() => void save()}>
      {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}{i18n.text(messages.save)}
    </Button>
  </>}>
    {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
    <TextEditor ref={editor} filename={filename} initialText={initial} gitBase={gitBase} lineWrapping={lineWrapping}
      onChange={setContent} onSave={() => void save()} onPosition={setPosition}
      onLanguageError={failure => {
        console.error("Editor language support could not be loaded.", failure);
        setError(messages.languageFailed);
      }} />
    <footer className="type-caption flex shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 text-muted-foreground">
      <span role="status">{i18n.text(saving ? commonMessages.statusBusy : dirty ? messages.unsaved : messages.saved)}
        {status && <> · {status}</>}</span>
      <span>{i18n.formatMessage(messages.position, position)}{format && <> · {format}</>}</span>
    </footer>
  </IslandPanel>;
}
