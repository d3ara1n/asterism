import { useEffect, useId, useRef, useState } from "react";
import { useI18n, useRendererCalls, type CreationInputProps } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Input } from "@asterism-app/ui/ui/input";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { CreationForm } from "../shared/creation-form";
import { todoMessages as messages } from "../messages/todo";
import { BrowseTodoLists, CreateSharedTodoList } from "./contract";
import { listCreationSchema, type TodoList } from "./model";
import { TodoError, todoFailure } from "./ui";
import { DeleteListDialog } from "./DeleteListDialog";

export function TodoListInput({ initialInput, busy, resolve, cancel }: CreationInputProps<{ listId?: string }>) {
  const i18n = useI18n(), calls = useRendererCalls(), id = useId();
  const [lists, setLists] = useState<TodoList[]>([]);
  const [listId, setListId] = useState(initialInput?.listId ?? "");
  const [title, setTitle] = useState("");
  const [maximum, setMaximum] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<TodoList | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const gate = useRef(false);
  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const result = await calls.invoke(BrowseTodoLists, {}, {});
      setLists(result);
      setListId(current => result.some(item => item.id === current) ? current : "");
    } catch (failure) { setError(todoFailure(failure)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(BrowseTodoLists, {}, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setLists(result); setLoading(false); }
    }, failure => { if (!controller.signal.aborted) { setError(todoFailure(failure)); setLoading(false); } });
    return () => controller.abort();
  }, [calls]);
  const newList = { title, maxCompletedItems: maximum.trim() === "" ? null : Number(maximum) };
  const selected = lists.find(item => item.id === listId);
  return <>
    <CreationForm busy={busy} disabled={!selected || creating || loading} onCancel={cancel} onSubmit={() => resolve({ listId })}>
      <Field><FieldLabel htmlFor={`${id}-list`}>{i18n.text(messages.sharedList)}</FieldLabel>
        <Select value={listId} onValueChange={setListId} disabled={busy || loading}>
          <SelectTrigger id={`${id}-list`}><SelectValue placeholder={i18n.text(lists.length ? messages.chooseList : messages.noLists)} /></SelectTrigger>
          <SelectContent><SelectGroup>{lists.map(list => <SelectItem key={list.id} value={list.id}>{list.title}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={loading || busy} onClick={() => void refresh()}>{loading && <Spinner />}{i18n.text(messages.refresh)}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!selected || busy} onClick={() => { if (selected) setDeleting(selected); }}>{i18n.text(messages.deleteList)}</Button>
        </div>
      </Field>
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-name`}>{i18n.text(messages.listName)}</FieldLabel>
          <Input id={`${id}-name`} maxLength={160} value={title} disabled={creating} onChange={event => setTitle(event.target.value)} />
        </Field>
        <Field><FieldLabel htmlFor={`${id}-maximum`}>{i18n.text(messages.maxCompleted)}</FieldLabel>
          <Input id={`${id}-maximum`} type="number" min={0} step={1} placeholder={i18n.text(messages.unbounded)} value={maximum} disabled={creating} onChange={event => setMaximum(event.target.value)} />
        </Field>
        <Button type="button" variant="outline" disabled={creating || busy || !listCreationSchema.safeParse(newList).success} onClick={async () => {
          if (gate.current) return;
          gate.current = true; setCreating(true); setError(null);
          try {
            const list = await calls.invoke(CreateSharedTodoList, newList, {});
            setLists(current => [...current, list]); setListId(list.id); setTitle(""); setMaximum("");
          } catch (failure) { setError(todoFailure(failure)); }
          finally { gate.current = false; setCreating(false); }
        }}>{creating && <Spinner />}{i18n.text(messages.newList)}</Button>
      </FieldGroup>
      <TodoError error={error} />
    </CreationForm>
    {deleting && <DeleteListDialog list={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />}
  </>;
}
