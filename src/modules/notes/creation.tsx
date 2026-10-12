import { useI18n, type CreationInputProps } from "@atelier/sdk/renderer";
import { useRef, useState } from "react";

import { CreationForm } from "../../renderer/shared/creation-form";
import { Field, FieldLabel, FieldError } from "../../renderer/shared/ui/field";
import { Input } from "../../renderer/shared/ui/input";
import { Textarea } from "../../renderer/shared/ui/textarea";
import { commonMessages } from "../messages/common";

type Value = { title: string; content: string };

/** 笔记在提交时检查名称；拖入文本时正文预填。 */
export function NoteInput({ initialInput, busy, resolve, cancel }: CreationInputProps<Partial<Value>>) {
  const i18n = useI18n();
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [content, setContent] = useState(initialInput?.content ?? "");
  const [titleError, setTitleError] = useState<import("@atelier/sdk/contracts").UiText | null>(null);
  return <CreationForm busy={busy} onCancel={cancel}
    validate={() => {
      if (title.trim()) return true;
      setTitleError(commonMessages.nameRequired);
      titleInput.current?.focus();
      return false;
    }}
    onSubmit={() => resolve({ title: title.trim(), content })}>
    <Field data-invalid={!!titleError}>
      <FieldLabel htmlFor="note-title">{i18n.formatMessage(commonMessages.name)}</FieldLabel>
      <Input ref={titleInput} id="note-title" autoFocus required maxLength={160} value={title}
        aria-invalid={!!titleError} aria-describedby={titleError ? "note-title-error" : undefined}
        onChange={e => { setTitle(e.target.value); setTitleError(null); }} />
      {titleError && <FieldError id="note-title-error">{i18n.text(titleError)}</FieldError>}
    </Field>
    <Field>
      <FieldLabel htmlFor="note-content">{i18n.formatMessage(commonMessages.content)}</FieldLabel>
      <Textarea id="note-content" className="field-sizing-fixed max-h-[40dvh]" maxLength={100_000} rows={7}
        value={content} onChange={e => setContent(e.target.value)} />
    </Field>
  </CreationForm>;
}
