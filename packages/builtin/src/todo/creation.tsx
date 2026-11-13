import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n, useRendererCalls, type CreationInputProps } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Input } from "@asterism-app/ui/ui/input";
import { Label } from "@asterism-app/ui/ui/label";
import { Field, FieldLabel, FieldTitle } from "@asterism-app/ui/ui/field";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { CreationForm } from "../shared/creation-form";
import { todoMessages as messages } from "../messages/todo";
import { BrowseTodoLists, CreateSharedTodoList } from "./contract";
import { listCreationSchema, type TodoList } from "./model";
import { TodoError, todoFailure } from "./ui";

const NEW = "new";

/**
 * One choice decides the action: an existing list connects directly; the trailing new-list option
 * creates the shared list and connects it in the same submission. When creation succeeds but the
 * connection fails, the created list becomes the selection so retrying does not create a duplicate.
 */
export function TodoListInput({ initialInput, busy, resolve, cancel }: CreationInputProps<{ listId?: string }>) {
  const i18n = useI18n(), calls = useRendererCalls(), id = useId();
  const [lists, setLists] = useState<TodoList[] | null>(null);
  const [choice, setChoice] = useState<string | null>(initialInput?.listId ?? null);
  const [title, setTitle] = useState("");
  const [limited, setLimited] = useState(false), [maximum, setMaximum] = useState("20");
  const [error, setError] = useState<UiText | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(BrowseTodoLists, {}, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setLists(result);
      setChoice(current => current !== null && result.some(item => item.id === current) ? current : result[0]?.id ?? NEW);
    }, failure => { if (!controller.signal.aborted) { setLists([]); setChoice(NEW); setError(todoFailure(failure)); } });
    return () => controller.abort();
  }, [calls]);
  const draft = { title: title.trim(), maxCompletedItems: limited ? (maximum.trim() ? Number(maximum) : Number.NaN) : null };
  const creating = choice === NEW;
  const ready = lists !== null && choice !== null && (!creating || listCreationSchema.safeParse(draft).success);
  const submit = async () => {
    setError(null);
    if (!creating) return choice !== null && await resolve({ listId: choice });
    let list: TodoList;
    try { list = await calls.invoke(CreateSharedTodoList, draft, {}); }
    catch (failure) { setError(todoFailure(failure)); return false; }
    setLists(current => [...current ?? [], list]); setChoice(list.id); setTitle("");
    return await resolve({ listId: list.id });
  };
  const option = (value: string) => `${id}-${value}`;
  return <CreationForm formRef={form} busy={busy} disabled={!ready} onCancel={cancel} onSubmit={submit}
    submitLabel={creating ? messages.createAndConnect : messages.connect}>
    <Field>
      <FieldTitle id={`${id}-label`}>{i18n.text(messages.sharedList)}</FieldTitle>
      {lists === null ? <div className="flex justify-center py-4"><Spinner className="text-muted-foreground" /></div>
        : <RadioGroup value={choice ?? ""} onValueChange={setChoice} aria-labelledby={`${id}-label`}
          className="max-h-[50dvh] gap-1 overflow-y-auto rounded-md border p-1"
          // Radix radios swallow Enter; in this form Enter submits the current choice.
          onKeyDown={event => { if (event.key === "Enter" && ready) { event.preventDefault(); form.current?.requestSubmit(); } }}>
          {lists.map(list => <Label key={list.id} htmlFor={option(list.id)}
            onDoubleClick={() => { setChoice(list.id); queueMicrotask(() => form.current?.requestSubmit()); }}
            className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-sm px-2 py-2 font-normal hover:bg-accent/60", choice === list.id && "bg-accent")}>
            <RadioGroupItem id={option(list.id)} value={list.id} />
            <span className="min-w-0 flex-1 truncate" title={list.title}>{list.title}</span>
            <span className="type-caption shrink-0 tabular-nums">
              {i18n.formatMessage(messages.listCounts, { open: list.counts.pending + list.counts.in_progress, done: list.counts.done })}
            </span>
          </Label>)}
          <Label htmlFor={option(NEW)} className={cn("flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 font-normal hover:bg-accent/60", creating && "bg-accent")}>
            <RadioGroupItem id={option(NEW)} value={NEW} />
            <Plus className="size-3.5 text-muted-foreground" />
            <span>{i18n.text(messages.newListOption)}</span>
          </Label>
        </RadioGroup>}
    </Field>
    {creating && <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3">
      <Field className="gap-1.5">
        <FieldLabel htmlFor={`${id}-name`}>{i18n.text(messages.listName)}</FieldLabel>
        <Input id={`${id}-name`} autoFocus maxLength={160} value={title} onChange={event => setTitle(event.target.value.replace(/[\r\n]+/gu, " "))} />
      </Field>
      <div className="flex min-h-8 items-center gap-2">
        <Checkbox id={`${id}-limit`} checked={limited} onCheckedChange={value => setLimited(value === true)} />
        <Label htmlFor={`${id}-limit`} className="font-normal">{i18n.text(messages.limitCompleted)}</Label>
        {limited && <Input type="number" min={0} step={1} inputMode="numeric" className="ml-auto h-8 w-20 tabular-nums"
          aria-label={i18n.text(messages.maxCompleted)} value={maximum} onChange={event => setMaximum(event.target.value)} />}
      </div>
    </div>}
    <TodoError error={error} />
  </CreationForm>;
}
