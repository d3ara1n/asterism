import { useRef, useState } from "react";
import { IslandPanel, useI18n } from "@asterism-app/sdk/renderer";
import { Search } from "lucide-react";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { TextEditor, type TextEditorHandle } from "./TextEditor";
import { parseEditorText } from "./text-format";
import { editorMessages as messages } from "../messages/editor";

export default function TextViewer({ path, text }: { path: string; text: string }) {
  const i18n = useI18n();
  const editor = useRef<TextEditorHandle>(null);
  const [initial] = useState(() => parseEditorText(text));
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [languageFailed, setLanguageFailed] = useState(false);
  return <IslandPanel title={path} layout="fill" action={
    <IconButton label={i18n.text(messages.searchText)} onClick={() => editor.current?.find()}><Search /></IconButton>
  }>
    {languageFailed && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.languageFailed)}</AlertDescription></Alert>}
    <TextEditor ref={editor} filename={path} initialText={initial.content} readOnly onPosition={setPosition}
      onLanguageError={failure => {
        console.error("Viewer language support could not be loaded.", failure);
        setLanguageFailed(true);
      }} />
    <footer className="type-caption flex shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 text-muted-foreground">
      <span>{i18n.text(messages.readOnly)}</span>
      <span>{i18n.formatMessage(messages.position, position)} · UTF-8</span>
    </footer>
  </IslandPanel>;
}
