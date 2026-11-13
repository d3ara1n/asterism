import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Check, FilePenLine, MessageSquareText, Pencil, Trash2, Undo2, UserRoundCheck } from "lucide-react";
import { IslandPanel, useI18n, useRendererCalls, useRendererIsland, useRendererObject } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Markdown } from "@asterism-app/ui/markdown";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { DropdownMenuItem } from "@asterism-app/ui/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@asterism-app/ui/ui/input-group";
import { PopoverDescription } from "@asterism-app/ui/ui/popover";
import { Separator } from "@asterism-app/ui/ui/separator";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { todoMessages as messages } from "../messages/todo";
import { SkillReferences } from "../skills/references";
import { MutateTodo, ReadTodoItem } from "./contract";
import type { Todo } from "./model";
import { MenuConfirm, TodoError, TodoStatusBadge, actorName, formatMoment, isNotFound, todoFailure, useTodoMutation } from "./ui";

const EditorIsland = lazy(() => import("../editor/EditorIsland").then(module => ({ default: module.EditorIsland })));

/** The current task, refreshed on list changes while the previous value stays on screen. */
function useTodo(id: string, latest: number) {
  const calls = useRendererCalls(), object = useRendererObject();
  const [state, setState] = useState<{ id: string; todo: Todo | null; gone: boolean; error: UiText | null }>({ id, todo: null, gone: false, error: null });
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(ReadTodoItem, { id }, { object: object.ref, signal: controller.signal }).then(todo => {
      if (!controller.signal.aborted) setState({ id, todo, gone: false, error: null });
    }, failure => {
      if (controller.signal.aborted) return;
      setState(current => isNotFound(failure) ? { id, todo: null, gone: true, error: null }
        : { id, todo: current.id === id ? current.todo : null, gone: false, error: todoFailure(failure) });
    });
    return () => controller.abort();
  }, [calls, object.ref, id, latest]);
  return state.id === id ? state : { id, todo: null, gone: false, error: null };
}

/** Completion note editor that replaces the action bar; Cmd/Ctrl+Enter submits and Escape returns to the actions. */
function CompletionComposer({ todo, onDone }: { todo: Todo; onDone(): void }) {
  const i18n = useI18n();
  const [note, setNote] = useState(todo.completion?.note ?? "");
  const { run, pending, error } = useTodoMutation();
  const submit = async () => {
    if (await run({ action: "complete", id: todo.id, ...(note.trim() ? { note } : {}) })) onDone();
  };
  const label = i18n.text(todo.status === "done" ? messages.editCompletion : messages.complete);
  return <form className="flex flex-col gap-2 border-t p-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <TodoError error={error} />
    <InputGroup>
      <InputGroupTextarea autoFocus value={note} rows={2} aria-label={i18n.text(messages.completionNote)}
        placeholder={i18n.text(messages.completionNote)} disabled={pending}
        className="max-h-40 min-h-0 py-2 text-xs md:text-xs"
        onChange={event => setNote(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDone(); }
          else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); }
        }} />
      <InputGroupAddon align="block-end" className="justify-end gap-1">
        <InputGroupButton size="xs" disabled={pending} onClick={onDone}>{i18n.text(commonMessages.cancel)}</InputGroupButton>
        <InputGroupButton type="submit" size="xs" variant="default" disabled={pending} aria-busy={pending}>
          {pending ? <Spinner /> : <Check />}{label}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </form>;
}

function ActionBar({ todo, onComplete }: { todo: Todo; onComplete(): void }) {
  const i18n = useI18n();
  const { run, pending, error } = useTodoMutation();
  const act = (action: "claim" | "release" | "reopen") => { void run({ action, id: todo.id }); };
  return <div className="flex flex-col gap-2 border-t p-2">
    <TodoError error={error} />
    <div className="flex flex-wrap items-center gap-2">
      {todo.status !== "done" && <Button size="sm" disabled={pending} onClick={onComplete}><Check />{i18n.text(messages.complete)}</Button>}
      {todo.status === "pending" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act("claim")}><UserRoundCheck />{i18n.text(messages.claim)}</Button>}
      {todo.status === "in_progress" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act("release")}><Undo2 />{i18n.text(messages.release)}</Button>}
      {todo.status === "done" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act("reopen")}><Undo2 />{i18n.text(messages.reopen)}</Button>}
      {pending && <Spinner className="text-muted-foreground" />}
    </div>
  </div>;
}

export function TaskDetail({ id, latest, focus, back }: { id: string; latest: number; focus: boolean; back(): void }) {
  const i18n = useI18n(), object = useRendererObject(), island = useRendererIsland();
  const { todo, gone, error } = useTodo(id, latest);
  const [completing, setCompleting] = useState(false), [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false), [openError, setOpenError] = useState<UiText | null>(null);
  const removal = useTodoMutation();
  const edit = async (origin: HTMLElement) => {
    if (!todo || opening) return;
    setOpening(true); setOpenError(null);
    try {
      await island.open({ key: `todo-content:${object.ref.sessionId}:${object.ref.id}:${todo.id}`, label: todo.title, size: "content", origin,
        render: () => <Suspense fallback={<IslandPanel title={todo.title}><Spinner /></IslandPanel>}>
          <EditorIsland title={todo.title} filename="task.md" text={todo.content} onSave={async content => {
            const receipt = await object.invoke(MutateTodo, { action: "write", id: todo.id, content });
            if (!receipt.ok) throw receipt.error;
          }} />
        </Suspense> });
    } catch (failure) { setOpenError(todoFailure(failure)); }
    finally { setOpening(false); }
  };
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <header className="flex min-w-0 items-center gap-1 border-b px-2 py-1.5">
      <Button size="icon-xs" variant="ghost" aria-label={i18n.text(messages.back)} title={i18n.text(messages.back)}
        autoFocus={focus} onClick={back}><ArrowLeft /></Button>
      <div className="min-w-0 flex-1">{todo && <TodoStatusBadge status={todo.status} />}</div>
      {todo && <>
        <IconButton size="icon-xs" label={i18n.text(messages.editContent)} disabled={opening}
          onClick={event => { void edit(event.currentTarget); }}>{opening ? <Spinner /> : <Pencil />}</IconButton>
        <MenuConfirm label={i18n.text(messages.taskActions)} open={confirming} onOpenChange={setConfirming}
          items={(confirm, handOff) => <>
            {todo.status === "done" && <DropdownMenuItem onSelect={() => { handOff(); setCompleting(true); }}>
              <MessageSquareText />{i18n.text(messages.editCompletion)}
            </DropdownMenuItem>}
            <DropdownMenuItem variant="destructive" onSelect={confirm}><Trash2 />{i18n.text(messages.deleteTask)}…</DropdownMenuItem>
          </>}>
          <PopoverDescription>{i18n.text(messages.deleteTaskConfirm)}</PopoverDescription>
          <TodoError error={removal.error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={removal.pending} onClick={() => setConfirming(false)}>{i18n.text(commonMessages.cancel)}</Button>
            <Button size="sm" variant="destructive" disabled={removal.pending} aria-busy={removal.pending} onClick={async () => {
              if (await removal.run({ action: "delete", id: todo.id })) { setConfirming(false); back(); }
            }}>{removal.pending && <Spinner />}{i18n.text(messages.deleteTask)}</Button>
          </div>
        </MenuConfirm>
      </>}
    </header>

    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      {gone ? <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="type-caption">{i18n.text(messages.taskGone)}</p>
        <Button size="sm" variant="outline" onClick={back}><ArrowLeft />{i18n.text(messages.back)}</Button>
      </div>
        : !todo ? !error && <div className="flex justify-center py-6"><Spinner className="text-muted-foreground" /></div>
          : <>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="type-section select-text break-words">{todo.title}</h3>
              <p className="type-caption">{[
                todo.assignee && i18n.formatMessage(messages.assignedTo, { actor: actorName(i18n, todo.assignee) }),
                i18n.formatMessage(messages.createdBy, { actor: actorName(i18n, todo.createdBy) }),
                formatMoment(i18n, todo.createdAt),
              ].filter(Boolean).join(" · ")}</p>
            </div>
            {todo.content.trim()
              ? <div className="select-text"><SkillReferences><Markdown>{todo.content}</Markdown></SkillReferences></div>
              : <Button size="sm" variant="ghost" className="self-start text-muted-foreground" disabled={opening}
                onClick={event => { void edit(event.currentTarget); }}><FilePenLine />{i18n.text(messages.noContent)}</Button>}
            {todo.completion && <>
              <Separator />
              <section className="flex flex-col gap-1.5">
                <p className="type-label">{i18n.formatMessage(messages.completedBy, { actor: actorName(i18n, todo.completion.completedBy) })} · {formatMoment(i18n, todo.completion.completedAt)}</p>
                {todo.completion.note !== null && <div className="select-text"><SkillReferences><Markdown>{todo.completion.note}</Markdown></SkillReferences></div>}
              </section>
            </>}
          </>}
      <TodoError error={error ?? openError} />
    </div>

    {todo && !gone && (completing
      ? <CompletionComposer todo={todo} onDone={() => setCompleting(false)} />
      : <ActionBar todo={todo} onComplete={() => setCompleting(true)} />)}
  </div>;
}
