import { useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { VList, type VListHandle } from "virtua";
import { Check, Plus, Trash2, Undo2, UserRoundCheck } from "lucide-react";
import { useI18n, useRendererObject } from "@asterism-app/sdk/renderer";
import { toast } from "sonner";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { DropdownMenuItem } from "@asterism-app/ui/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { ListRow, ListRowAction } from "@asterism-app/ui/ui/list-row";
import { todoMessages as messages } from "../messages/todo";
import { SlidePage } from "../shared/slide-page";
import type { TodoListCardData } from "./contract";
import type { TodoList, TodoSummary } from "./model";
import { DeleteListConfirm } from "./DeleteListConfirm";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskDetail } from "./TaskDetail";
import { MenuConfirm, TodoError, TodoStatusIcon, actorName, formatMoment, useTodoMutation } from "./ui";
import { useTodoPages, type TodoFilterKey } from "./use-todo-pages";

/** The row's next step in the lifecycle, revealed on hover or focus; the detail page offers every transition. */
function QuickAction({ todo }: { todo: TodoSummary }) {
  const i18n = useI18n();
  const { run, pending } = useTodoMutation(error => { toast.error(i18n.text(error)); });
  const [label, Icon, input] = todo.status === "pending" ? [messages.claim, UserRoundCheck, { action: "claim", id: todo.id } as const]
    : todo.status === "in_progress" ? [messages.complete, Check, { action: "complete", id: todo.id } as const]
      : [messages.reopen, Undo2, { action: "reopen", id: todo.id } as const];
  return <ListRowAction aria-label={i18n.text(label)} title={i18n.text(label)} disabled={pending} aria-busy={pending}
    className={pending ? "w-6 opacity-100" : undefined} onClick={() => { void run(input); }}>
    {pending ? <Spinner /> : <Icon />}
  </ListRowAction>;
}

function TaskRow({ todo, onOpen }: { todo: TodoSummary; onOpen(): void }) {
  const i18n = useI18n();
  const facts = [todo.assignee && actorName(i18n, todo.assignee), formatMoment(i18n, todo.updatedAt)].filter(Boolean).join(" · ");
  return <ListRow title={<span className="line-clamp-2 break-words">{todo.title}</span>} onOpen={onOpen} inactive={todo.status === "done"}
    media={<TodoStatusIcon status={todo.status} />}
    className="gap-2 px-3 py-1.5 [&_[data-slot=item-title]]:text-xs [&_[data-slot=item-description]]:text-xs [&_[data-slot=item-description]]:leading-snug"
    contentClassName="gap-0.5" description={facts} actions={<QuickAction todo={todo} />} />;
}

function ListPage({ list, latest, filter, onFilter, onOpen }: {
  list: TodoList; latest: number; filter: TodoFilterKey; onFilter(filter: TodoFilterKey): void; onOpen(id: string): void;
}) {
  const i18n = useI18n();
  const { pages, error, loadingMore, loadMore } = useTodoPages(filter, latest);
  const [creating, setCreating] = useState(false), [deleting, setDeleting] = useState(false);
  const scroller = useRef<VListHandle>(null);
  const counts = { open: list.counts.pending + list.counts.in_progress, done: list.counts.done, all: list.counts.pending + list.counts.in_progress + list.counts.done };
  const reachEnd = () => {
    const handle = scroller.current;
    if (handle && handle.scrollOffset + handle.viewportSize >= handle.scrollSize - 120) loadMore();
  };
  return <>
    <header className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <ToggleGroup type="single" size="sm" value={filter} aria-label={i18n.text(messages.status)} className="min-w-0 flex-1"
        onValueChange={value => { if (value) onFilter(value as TodoFilterKey); }}>
        {(["open", "done", "all"] as const).map(key => <ToggleGroupItem key={key} value={key} className="h-7 gap-1.5 px-2 text-xs">
          {i18n.text(messages[key])}<span className="tabular-nums text-muted-foreground">{counts[key]}</span>
        </ToggleGroupItem>)}
      </ToggleGroup>
      <IconButton size="icon-xs" label={i18n.text(messages.newTask)} onClick={() => setCreating(true)}><Plus /></IconButton>
      <MenuConfirm label={i18n.text(messages.listActions)} open={deleting} onOpenChange={setDeleting}
        items={confirm => <DropdownMenuItem variant="destructive" onSelect={confirm}><Trash2 />{i18n.text(messages.deleteList)}…</DropdownMenuItem>}>
        {deleting && <DeleteListConfirm list={list} onClose={() => setDeleting(false)} />}
      </MenuConfirm>
    </header>
    <TodoError error={error} className="m-2 w-auto" />
    {!pages ? !error && <div className="flex justify-center py-6"><Spinner className="text-muted-foreground" /></div>
      : pages.todos.length === 0 ? <Empty className="p-6"><EmptyHeader><EmptyTitle className="text-sm">{i18n.text(messages.noTasks)}</EmptyTitle></EmptyHeader>
        {filter !== "done" && <EmptyContent><Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus />{i18n.text(messages.newTask)}</Button></EmptyContent>}
      </Empty>
        : <ItemGroup className="relative min-h-0 flex-1">
          <VList ref={scroller} data={pages.todos} onScroll={reachEnd} className="py-1">
            {todo => <TaskRow key={todo.id} todo={todo} onOpen={() => onOpen(todo.id)} />}
          </VList>
          {loadingMore && <Spinner className="absolute bottom-2 left-1/2 -translate-x-1/2 text-muted-foreground" />}
        </ItemGroup>}
    {creating && <NewTaskDialog onClose={() => setCreating(false)} onCreated={() => { if (filter === "done") onFilter("open"); }} />}
  </>;
}

export function TodoListCard({ data }: { data: TodoListCardData }) {
  const object = useRendererObject(), i18n = useI18n();
  const retained = object.retained.get("asterism.builtin/todo-view", () => ({ id: null as string | null, filter: "open" as TodoFilterKey }));
  const [selected, setSelected] = useState(retained.id), [filter, setFilter] = useState(retained.filter);
  /** Focus moves into the details only when the user opens them, not when a retained selection is restored. */
  const [opened, setOpened] = useState(false);
  const direction = useRef<1 | -1>(1);
  const select = (id: string | null) => {
    direction.current = id === null ? -1 : 1;
    retained.id = id; setSelected(id); setOpened(id !== null);
  };
  if (!data.list) return <Empty><EmptyHeader><EmptyTitle className="text-sm">{i18n.text(messages.unavailable)}</EmptyTitle></EmptyHeader></Empty>;
  return <div className="nodrag nopan relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
      <SlidePage key={selected ? `task:${selected}` : "list"} direction={direction.current}>
        {selected ? <TaskDetail id={selected} latest={data.latest} focus={opened} back={() => select(null)} />
          : <ListPage list={data.list} latest={data.latest} filter={filter} onOpen={select}
            onFilter={value => { retained.filter = value; setFilter(value); }} />}
      </SlidePage>
    </AnimatePresence>
  </div>;
}
