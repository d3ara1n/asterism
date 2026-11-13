import { useEffect, useId, useRef, useState } from "react";
import { useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { todoMessages as messages } from "../messages/todo";
import { BrowseTodoLists, DeleteSharedTodoList } from "./contract";
import type { TodoList } from "./model";
import { TodoError, todoFailure } from "./ui";

export function DeleteListDialog({ list, onClose, onDeleted }: { list: TodoList; onClose(): void; onDeleted?(): void | Promise<void> }) {
  const i18n = useI18n(), calls = useRendererCalls(), id = useId();
  const [lists, setLists] = useState<TodoList[]>([]);
  const [target, setTarget] = useState("discard");
  const [error, setError] = useState<UiText | null>(null);
  const [pending, setPending] = useState(false);
  const gate = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(BrowseTodoLists, {}, { signal: controller.signal }).then(setLists, failure => {
      if (!controller.signal.aborted) setError(todoFailure(failure));
    });
    return () => controller.abort();
  }, [calls]);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent><DialogHeader>
      <DialogTitle>{i18n.text(messages.deleteList)} · {list.title}</DialogTitle>
      <DialogDescription>{i18n.text(messages.deleteWarning)}</DialogDescription>
    </DialogHeader>
      <Field><FieldLabel htmlFor={id}>{i18n.text(messages.openTasks)}</FieldLabel>
        <Select value={target} onValueChange={setTarget} disabled={pending}>
          <SelectTrigger id={id}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="discard">{i18n.text(messages.discard)}</SelectItem>
            {lists.filter(item => item.id !== list.id).map(item => <SelectItem key={item.id} value={item.id}>{i18n.formatMessage(messages.transfer, { title: item.title })}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <TodoError error={error} />
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>{i18n.text(commonMessages.cancel)}</Button>
        <Button variant="destructive" disabled={pending} onClick={async () => {
          if (gate.current) return;
          gate.current = true; setPending(true); setError(null);
          try {
            await calls.invoke(DeleteSharedTodoList, { listId: list.id, ...(target === "discard" ? {} : { transferOpenTodosTo: target }) }, {});
            await onDeleted?.(); onClose();
          } catch (failure) { setError(todoFailure(failure)); }
          finally { gate.current = false; setPending(false); }
        }}>{pending && <Spinner />}{i18n.text(messages.deleteList)}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
