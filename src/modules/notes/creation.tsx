import { useRef, useState } from "react";
import type { CreationInputProps } from "@atelier/sdk/renderer";
import { Field, FieldError, FieldLabel } from "../../renderer/shared/ui/field";
import { Input } from "../../renderer/shared/ui/input";
import { Textarea } from "../../renderer/shared/ui/textarea";
import { CreationForm } from "../../renderer/shared/creation-form";
import { t } from "../../renderer/shared/i18n";

type Value = { title: string; content: string };

/** 笔记在提交时检查名称；拖入文本时正文预填。 */
export function NoteInput({ initialInput, busy, resolve, cancel }: CreationInputProps<Partial<Value>>) {
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [content, setContent] = useState(initialInput?.content ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  return <CreationForm busy={busy} onCancel={cancel}
    validate={() => {
      if (title.trim()) return true;
      setTitleError(t.nameRequired);
      titleInput.current?.focus();
      return false;
    }}
    onSubmit={() => resolve({ title: title.trim(), content })}>
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
  </CreationForm>;
}
