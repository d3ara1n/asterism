import { useI18n, type CreationInputProps } from "@asterism/sdk/renderer";
import { useRef, useState } from "react";

import { CreationForm } from "../shared/creation-form";
import { Field, FieldLabel, FieldError } from "@asterism/ui/ui/field";
import { Input } from "@asterism/ui/ui/input";
import { Textarea } from "@asterism/ui/ui/textarea";
import { commonMessages } from "../messages/common";

type Value = { title: string; content: string };

/** Notes validate the name on submission; dropped text prefills the body. */
export function NoteInput({ initialInput, busy, resolve, cancel }: CreationInputProps<Partial<Value>>) {
  const i18n = useI18n();
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [content, setContent] = useState(initialInput?.content ?? "");
  const [titleError, setTitleError] = useState<import("@asterism/sdk/contracts").UiText | null>(null);
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
