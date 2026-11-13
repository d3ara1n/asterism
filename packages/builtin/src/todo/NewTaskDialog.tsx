import { useId, useRef, useState } from "react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { todoMessages as messages } from "../messages/todo";
import { todoCreationSchema } from "./model";
import { TodoError, useTodoMutation } from "./ui";

const submitKeys = (event: React.KeyboardEvent) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;

/** Enter in the title moves to the description; Cmd/Ctrl+Enter creates from either field. */
export function NewTaskDialog({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const i18n = useI18n(), id = useId();
  const [title, setTitle] = useState(""), [content, setContent] = useState("");
  const form = useRef<HTMLFormElement>(null), body = useRef<HTMLTextAreaElement>(null);
  const { pending, error, run } = useTodoMutation();
  const valid = todoCreationSchema.safeParse({ title, content }).success;
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{i18n.text(messages.newTask)}</DialogTitle>
        <DialogDescription className="sr-only">{i18n.text(messages.newTask)}</DialogDescription>
      </DialogHeader>
      <form ref={form} className="flex flex-col gap-4" onSubmit={async event => {
        event.preventDefault();
        if (valid && await run({ action: "create", title: title.trim(), content })) { onCreated(); onClose(); }
      }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor={`${id}-title`}>{i18n.text(messages.title)}</FieldLabel>
            <Input id={`${id}-title`} autoFocus required maxLength={160} disabled={pending} value={title}
              onChange={event => setTitle(event.target.value.replace(/[\r\n]+/gu, " "))}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || event.key !== "Enter") return;
                event.preventDefault();
                if (event.metaKey || event.ctrlKey) form.current?.requestSubmit(); else body.current?.focus();
              }} />
          </Field>
          <Field><FieldLabel htmlFor={`${id}-content`}>{i18n.text(messages.content)}</FieldLabel>
            <Textarea ref={body} id={`${id}-content`} rows={8} className="field-sizing-fixed max-h-[40dvh]" disabled={pending} value={content}
              onChange={event => setContent(event.target.value)}
              onKeyDown={event => { if (submitKeys(event)) { event.preventDefault(); form.current?.requestSubmit(); } }} />
          </Field>
        </FieldGroup>
        <TodoError error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{i18n.text(commonMessages.cancel)}</Button>
          <Button disabled={pending || !valid} aria-busy={pending}>{pending && <Spinner />}{i18n.text(commonMessages.create)}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
