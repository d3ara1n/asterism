import { lazy, Suspense, useEffect, useId, useState } from "react";
import type { z } from "zod";
import { IslandPanel, useI18n, useRendererCalls, useRendererIsland, useRendererObject } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Markdown } from "@asterism-app/ui/markdown";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@asterism-app/ui/ui/item";
import { Separator } from "@asterism-app/ui/ui/separator";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { todoMessages as messages } from "../messages/todo";
import { SkillReferences } from "../skills/references";
import { MutateTodo, ReadTodoItem, ReadTodoPage, type TodoListCardData } from "./contract";
import { todoCreationSchema, type Actor, type Todo, type TodoPage, type todoPageResultSchema } from "./model";
import { DeleteListDialog } from "./DeleteListDialog";
import { TodoError, todoFailure, useTodoMutation } from "./ui";

const EditorIsland = lazy(() => import("../editor/EditorIsland").then(module => ({ default: module.EditorIsland })));
const statuses = ["pending", "in_progress", "done"] as const;
function ActorLabel({ actor }: { actor: Actor | null }) {
  const i18n = useI18n();
  return <>{actor === null ? i18n.text(messages.unassigned) : actor.kind === "user" ? i18n.text(messages.user) : actor.title}</>;
}
function StatusBadge({ status }: { status: Todo["status"] }) {
  const i18n = useI18n();
  return <Badge variant={status === "done" ? "success" : status === "in_progress" ? "secondary" : "outline"}>{i18n.text(messages[status])}</Badge>;
}
function NewTaskDialog({ onClose }: { onClose(): void }) {
  const i18n = useI18n(), id = useId();
  const [title, setTitle] = useState(""), [content, setContent] = useState("");
  const { pending, error, run } = useTodoMutation();
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>{i18n.text(messages.newTask)}</DialogTitle></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={async event => {
        event.preventDefault();
        if (todoCreationSchema.safeParse({ title, content }).success && await run({ action: "create", title, content })) { onClose(); }
      }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor={`${id}-title`}>{i18n.text(messages.title)}</FieldLabel>
            <Input id={`${id}-title`} autoFocus required maxLength={160} disabled={pending} value={title} onChange={event => setTitle(event.target.value)} />
          </Field>
          <Field><FieldLabel htmlFor={`${id}-content`}>{i18n.text(messages.content)}</FieldLabel>
            <Textarea id={`${id}-content`} rows={8} className="field-sizing-fixed max-h-[40dvh]" disabled={pending} value={content} onChange={event => setContent(event.target.value)} />
          </Field>
        </FieldGroup>
        <TodoError error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{i18n.text(commonMessages.cancel)}</Button>
          <Button disabled={pending || !todoCreationSchema.safeParse({ title, content }).success}>{pending && <Spinner />}{i18n.text(commonMessages.create)}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function TaskDialog({ todo, onClose }: { todo: Todo; onClose(): void }) {
  const i18n = useI18n(), object = useRendererObject(), island = useRendererIsland(), id = useId();
  const { run, pending, error } = useTodoMutation();
  const [completing, setCompleting] = useState(false), [note, setNote] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [opening, setOpening] = useState(false), [openError, setOpenError] = useState<UiText | null>(null);
  const mutate = async (action: "claim" | "release" | "reopen" | "delete") => {
    if (await run({ action, id: todo.id }) && action === "delete") onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" onCloseAutoFocus={event => { if (opening) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{todo.title}</DialogTitle></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={todo.status} />
          <span className="type-caption text-muted-foreground">{i18n.text(messages.assignee)}: <ActorLabel actor={todo.assignee} /></span>
        </div>
        <div className="select-text"><SkillReferences><Markdown>{todo.content}</Markdown></SkillReferences></div>
        <Button size="sm" variant="outline" className="self-start" disabled={opening} onClick={async event => {
          if (opening) return;
          const origin = event.currentTarget;
          setOpening(true); setOpenError(null);
          try {
            const opened = await island.open({ key: `todo-content:${object.ref.sessionId}:${object.ref.id}:${todo.id}`, label: todo.title, size: "content", origin,
              render: () => <Suspense fallback={<IslandPanel title={todo.title}><Spinner /></IslandPanel>}>
                <EditorIsland title={todo.title} filename="task.md" text={todo.content} onSave={async content => {
                  const receipt = await object.invoke(MutateTodo, { action: "write", id: todo.id, content });
                  if (!receipt.ok) throw receipt.error;
                }} />
              </Suspense> });
            if (opened) onClose();
          } catch (failure) { setOpenError(todoFailure(failure)); }
          finally { setOpening(false); }
        }}>{opening ? <Spinner /> : <Pencil data-icon="inline-start" />}{i18n.text(messages.editContent)}</Button>
        {todo.completion && <>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="type-label">{i18n.text(messages.completion)} · <ActorLabel actor={todo.completion.completedBy} /> · {i18n.formatDate(Date.parse(todo.completion.completedAt), { dateStyle: "medium", timeStyle: "short" })}</p>
            {todo.completion.note !== null && <SkillReferences><Markdown>{todo.completion.note}</Markdown></SkillReferences>}
          </div>
        </>}
        <div className="type-caption flex flex-col gap-1 text-muted-foreground">
          <span>{i18n.text(messages.createdBy)}: <ActorLabel actor={todo.createdBy} /> · {i18n.formatDate(Date.parse(todo.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
          <span>{i18n.text(messages.updatedBy)}: <ActorLabel actor={todo.updatedBy} /> · {i18n.formatDate(Date.parse(todo.updatedAt), { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {todo.status === "pending" && <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate("claim")}>{i18n.text(messages.claim)}</Button>}
          {todo.status === "in_progress" && <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate("release")}>{i18n.text(messages.release)}</Button>}
          {todo.status === "done" && <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate("reopen")}>{i18n.text(messages.reopen)}</Button>}
          <Button size="sm" disabled={pending} onClick={() => { setNote(todo.completion?.note ?? null); setCompleting(true); }}>
            {i18n.text(todo.status === "done" ? messages.replaceCompletion : messages.complete)}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeleteConfirm(true)}>{i18n.text(messages.deleteTask)}</Button>
        </div>
        {completing && <form className="flex flex-col gap-3" onSubmit={async event => {
          event.preventDefault();
          if (await run({ action: "complete", id: todo.id, ...(note === null ? {} : { note }) })) onClose();
        }}>
          <Field><FieldLabel htmlFor={id}>{i18n.text(messages.completionNote)}</FieldLabel>
            <Textarea id={id} autoFocus rows={4} disabled={pending} value={note ?? ""} onChange={event => setNote(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setCompleting(false)}>{i18n.text(commonMessages.cancel)}</Button>
            <Button disabled={pending}>{pending && <Spinner />}{i18n.text(todo.status === "done" ? messages.replaceCompletion : messages.complete)}</Button>
          </div>
        </form>}
        {deleteConfirm && <div className="flex items-center justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setDeleteConfirm(false)}>{i18n.text(commonMessages.cancel)}</Button>
          <Button variant="destructive" disabled={pending} onClick={() => void mutate("delete")}>{i18n.text(messages.deleteTask)}</Button>
        </div>}
        <TodoError error={error ?? openError} />
      </div>
    </DialogContent>
  </Dialog>;
}

export function TodoListCard({ data }: { data: TodoListCardData }) {
  const i18n = useI18n(), calls = useRendererCalls(), object = useRendererObject();
  const [filter, setFilter] = useState<Todo["status"] | "all">("all"), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<z.output<typeof todoPageResultSchema> | null>(null);
  const [pageError, setPageError] = useState<UiText | null>(null), [itemError, setItemError] = useState<UiText | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [todo, setTodo] = useState<Todo | null>(null);
  const [creating, setCreating] = useState(false), [deleting, setDeleting] = useState(false);
  const available = data.list !== null;
  useEffect(() => {
    setPage(null); setPageError(null);
    if (!available) return;
    const controller = new AbortController();
    const input: TodoPage = { offset, limit: 100, ...(filter === "all" ? {} : { status: [filter] }) };
    void calls.invoke(ReadTodoPage, input, { object: object.ref, signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      // Normal deletion, completion, or filtering can remove the last task on this page.
      const lastOffset = Math.max(0, Math.ceil(value.total / input.limit) - 1) * input.limit;
      if (offset > lastOffset) { setOffset(lastOffset); return; }
      setPage(value);
    }, failure => { if (!controller.signal.aborted) setPageError(todoFailure(failure)); });
    return () => controller.abort();
  }, [calls, object.ref, available, data.latest, offset, filter]);
  useEffect(() => {
    if (!available || !selected) { setTodo(null); return; }
    setItemError(null);
    const controller = new AbortController();
    void calls.invoke(ReadTodoItem, { id: selected }, { object: object.ref, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setTodo(value);
    }, failure => {
      if (!controller.signal.aborted) { setTodo(null); setSelected(null); setItemError(todoFailure(failure)); }
    });
    return () => controller.abort();
  }, [calls, object.ref, available, data.latest, selected]);
  if (!data.list) return <Empty><EmptyHeader><EmptyTitle>{i18n.text(messages.unavailable)}</EmptyTitle></EmptyHeader></Empty>;
  const list = data.list;
  return <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col gap-2 p-3">
    <div className="flex shrink-0 items-center justify-between gap-2">
      <span className="type-label min-w-0 truncate" title={list.title}>{list.title}</span>
      <div className="flex gap-1">
        <IconButton size="icon-xs" label={i18n.text(messages.newTask)} onClick={() => setCreating(true)}><Plus /></IconButton>
        <IconButton size="icon-xs" label={i18n.text(messages.deleteList)} onClick={() => setDeleting(true)}><Trash2 /></IconButton>
      </div>
    </div>
    <div className="shrink-0 overflow-x-auto"><ToggleGroup type="single" size="sm" variant="outline" value={filter} aria-label={i18n.text(messages.status)} onValueChange={value => {
      if (value) { setFilter(value as typeof filter); setOffset(0); }
    }}>
      <ToggleGroupItem value="all">{i18n.text(messages.all)}</ToggleGroupItem>
      {statuses.map(status => <ToggleGroupItem key={status} value={status}>{i18n.text(messages[status])} {list.counts[status]}</ToggleGroupItem>)}
    </ToggleGroup></div>
    <TodoError error={pageError ?? itemError} />
    <div className="min-h-0 flex-1 overflow-auto">
      {!page && !pageError && <Spinner className="m-3" />}
      {page?.todos.length === 0 && <Empty><EmptyHeader><EmptyTitle>{i18n.text(messages.noTasks)}</EmptyTitle></EmptyHeader></Empty>}
      <ItemGroup>{page?.todos.map(item => <Item key={item.id} size="sm" asChild>
        <button type="button" className="w-full text-left" onClick={() => { setTodo(null); setSelected(item.id); }}>
          <ItemContent className="min-w-0"><ItemTitle className="line-clamp-2">{item.title}</ItemTitle>
            <ItemDescription><ActorLabel actor={item.assignee} /></ItemDescription>
          </ItemContent><StatusBadge status={item.status} />
        </button>
      </Item>)}</ItemGroup>
    </div>
    {page && <div className="type-caption flex shrink-0 items-center justify-between gap-2 text-muted-foreground">
      <span>{i18n.formatMessage(messages.page, { start: page.todos.length ? offset + 1 : 0, end: page.todos.length ? offset + page.todos.length : 0, total: page.total })}</span>
      <div className="flex gap-1">
        <IconButton size="icon-xs" label={i18n.text(messages.back)} disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 100))}><ChevronLeft /></IconButton>
        <IconButton size="icon-xs" label={i18n.text(messages.next)} disabled={page.nextOffset === null} onClick={() => { if (page.nextOffset !== null) setOffset(page.nextOffset); }}><ChevronRight /></IconButton>
      </div>
    </div>}
    {selected && !todo && <Spinner className="self-center" />}
    {todo && selected && <TaskDialog key={todo.id} todo={todo} onClose={() => { setSelected(null); setTodo(null); }} />}
    {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
    {deleting && <DeleteListDialog list={list} onClose={() => setDeleting(false)} />}
  </div>;
}
