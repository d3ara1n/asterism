import { useEffect, useId, useRef, useState } from "react";
import { useI18n, useRendererCalls } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { PopoverDescription } from "@asterism-app/ui/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { todoMessages as messages } from "../messages/todo";
import { BrowseTodoLists, DeleteSharedTodoList } from "./contract";
import type { TodoList } from "./model";
import { TodoError, todoFailure } from "./ui";

/** Popover body for deleting a shared list; a successful deletion leaves the bound card unavailable. */
export function DeleteListConfirm({ list, onClose }: { list: TodoList; onClose(): void }) {
  const i18n = useI18n(), calls = useRendererCalls(), id = useId();
  const [lists, setLists] = useState<TodoList[] | null>(null);
  const [target, setTarget] = useState("discard");
  const [error, setError] = useState<UiText | null>(null);
  const [pending, setPending] = useState(false);
  const gate = useRef(false);
  const unfinished = list.counts.pending + list.counts.in_progress;
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(BrowseTodoLists, {}, { signal: controller.signal }).then(setLists, failure => {
      if (!controller.signal.aborted) setError(todoFailure(failure));
    });
    return () => controller.abort();
  }, [calls]);
  const others = lists?.filter(item => item.id !== list.id) ?? [];
  return <>
    <PopoverDescription>{i18n.text(messages.deleteWarning)}</PopoverDescription>
    {unfinished > 0 && others.length > 0 && <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="type-label">{i18n.text(messages.openTasks)} · {unfinished}</FieldLabel>
      <Select value={target} onValueChange={setTarget} disabled={pending}>
        <SelectTrigger id={id} size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="discard">{i18n.text(messages.discard)}</SelectItem>
          {others.map(item => <SelectItem key={item.id} value={item.id}>
            {i18n.formatMessage(messages.transfer, { title: item.title })}
            <span className="type-caption tabular-nums">{i18n.formatMessage(messages.listCounts, { open: item.counts.pending + item.counts.in_progress, done: item.counts.done })}</span>
          </SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
    </Field>}
    <TodoError error={error} />
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={onClose}>{i18n.text(commonMessages.cancel)}</Button>
      <Button size="sm" variant="destructive" disabled={pending || lists === null} aria-busy={pending} onClick={async () => {
        if (gate.current) return;
        gate.current = true; setPending(true); setError(null);
        try {
          await calls.invoke(DeleteSharedTodoList, { listId: list.id, ...(target === "discard" ? {} : { transferOpenTodosTo: target }) }, {});
          onClose();
        } catch (failure) { setError(todoFailure(failure)); }
        finally { gate.current = false; setPending(false); }
      }}>{pending && <Spinner />}{i18n.text(messages.deleteList)}</Button>
    </div>
  </>;
}
