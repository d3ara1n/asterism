import { useRef, useState } from "react";
import { Field, FieldError, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { t } from "../../shared/i18n";
import { ResourceCreationDialog, type ResourceCreationDialogState } from "./ResourceCreationDialog";

/** 笔记在提交时检查名称；当前卡片只读，正文在此填写。 */
export function AddNoteDialog({ onCreate, ...dialog }: ResourceCreationDialogState & {
  onCreate: (input: { title: string; content: string }) => Promise<boolean>;
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  return <ResourceCreationDialog {...dialog} title={t.createNoteTitle} description={t.createNoteDescription}
    validate={() => {
      if (title.trim()) return true;
      setTitleError(t.nameRequired);
      titleInput.current?.focus();
      return false;
    }}
    onCreate={() => onCreate({ title: title.trim(), content })}>
    <Field data-invalid={!!titleError}>
      <FieldLabel htmlFor="note-title">{t.name}</FieldLabel>
      <Input ref={titleInput} id="note-title" autoFocus required maxLength={160} value={title}
        aria-invalid={!!titleError} aria-describedby={titleError ? "note-title-error" : undefined}
        onChange={e => { setTitle(e.target.value); setTitleError(null); }} />
      {titleError && <FieldError id="note-title-error">{titleError}</FieldError>}
    </Field>
    <Field>
      <FieldLabel htmlFor="note-content">{t.content}</FieldLabel>
      <Textarea id="note-content" className="field-sizing-fixed max-h-[40dvh]" maxLength={100_000} rows={7}
        value={content} onChange={e => setContent(e.target.value)} />
    </Field>
  </ResourceCreationDialog>;
}
