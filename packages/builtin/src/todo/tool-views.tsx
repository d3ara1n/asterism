import type { ReactNode } from "react";
import type { z } from "zod";
import { ArrowRight, Users } from "lucide-react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import type { Json, UiText } from "@asterism-app/sdk/contracts";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Markdown } from "@asterism-app/ui/markdown";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { CodeRows } from "@asterism-app/ui/code-view";
import { todoMessages as messages } from "../messages/todo";
import { SkillReferences } from "../skills/references";
import { inputField, inputText, toolTextTail } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { displayText } from "../shared/text-row";
import type { BrowseTodoLists, CreateSharedTodoList, DeleteSharedTodoList, TodoGrep, TodoListItems, TodoRead } from "./contract";
import type { Actor, Todo, TodoList, TodoSummary } from "./model";
import { TodoStatusIcon, actorName } from "./ui";

type Mutation = { changed: boolean; todo: Todo; retained: boolean };
const Mono = ({ children }: { children: string }) => <span className="font-mono">{children}</span>;
const statusOrder = ["pending", "in_progress", "done"] as const;

/** The resulting status as an icon with its name; an unchanged call or a pruned task is marked instead. */
function MutationMeta({ data }: { data: Mutation | null | undefined }) {
  const i18n = useI18n();
  if (!data) return null;
  if (!data.retained) return <Badge variant="outline" className="font-normal">{i18n.text(messages.pruned)}</Badge>;
  return <span className="inline-flex items-center gap-1.5">
    {!data.changed && <span>{i18n.text(messages.unchanged)} ·</span>}
    <TodoStatusIcon status={data.todo.status} /><span>{i18n.text(messages[data.todo.status])}</span>
  </span>;
}
function MarkdownBody({ text }: { text: string }) {
  return <div className="select-text"><SkillReferences><Markdown>{text}</Markdown></SkillReferences></div>;
}
/** Who holds the task after the change; the header already names the task and its status. */
function Holder({ actor }: { actor: Actor | null }) {
  const i18n = useI18n();
  return actor ? <p className="type-caption inline-flex items-center gap-1.5"><Users className="size-3" aria-hidden />{actorName(i18n, actor)}</p> : null;
}

/* ---------- task lifecycle ---------- */

type CreateProps = ToolRenderProps<Mutation, null, Json>;
function CreateHeader(props: CreateProps) {
  const i18n = useI18n(), title = props.result?.data?.todo.title ?? inputText(props.args, "title");
  return <ToolHeader label={i18n.text(messages.newTask)} subject={useToolResourceSubject(props.invocation.resource)}
    summary={title} meta={<MutationMeta data={props.result?.data} />} />;
}
function CreateBody(props: CreateProps) {
  const content = props.phase === "settled" ? props.result.data?.todo.content ?? inputText(props.args, "content") : inputText(props.args, "content");
  if (!content?.trim()) return null;
  return props.phase === "input" ? <StreamingPreview><p className="type-body whitespace-pre-wrap break-words">{toolTextTail(content)}</p></StreamingPreview>
    : <MarkdownBody text={content} />;
}
export const createViews = {
  input: { headerRenderer: CreateHeader, bodyRenderer: CreateBody, streaming: ({ args }) => !!inputText(args, "content") },
  execution: { headerRenderer: CreateHeader, bodyRenderer: CreateBody },
  result: { headerRenderer: CreateHeader, bodyRenderer: CreateBody },
} satisfies ToolRendererDefinition<Mutation, null, Json>;

type ItemProps<A extends Json = Json> = ToolRenderProps<Mutation, { id: string }, A>;
/** Claim, release, reopen, and complete share one row: the task title once known, otherwise its ID, then the resulting status. */
function transitionViews<A extends Json>(label: UiText, Body?: (props: ItemProps<A>) => ReactNode) {
  function Header(props: ItemProps<A>) {
    const i18n = useI18n(), data = props.result?.data;
    const id = inputText(props.target, "id");
    return <ToolHeader label={i18n.text(label)} subject={useToolResourceSubject(props.invocation.resource)}
      summary={data ? data.todo.title : id && <Mono>{id}</Mono>} meta={<MutationMeta data={data} />} />;
  }
  const view = { headerRenderer: Header, ...(Body ? { bodyRenderer: Body } : {}) };
  return { input: { headerRenderer: Header }, execution: view, result: view } satisfies ToolRendererDefinition<Mutation, { id: string }, A>;
}
export const claimViews = transitionViews(messages.claim, ({ result }) => result?.data?.changed ? <Holder actor={result.data.todo.assignee} /> : null);
export const releaseViews = transitionViews(messages.release);
export const reopenViews = transitionViews(messages.reopen);
export const completeViews = transitionViews<{ note?: string }>(messages.complete, ({ args, phase }) => {
  const note = phase === "input" ? undefined : args.note;
  return note?.trim() ? <MarkdownBody text={note} /> : null;
});

type DeleteProps = ToolRenderProps<{ deletedId: string }, { id: string }>;
function DeleteHeader({ target, invocation }: DeleteProps) {
  const id = inputText(target, "id");
  return <ToolHeader label={useI18n().text(messages.deleteTask)} subject={useToolResourceSubject(invocation.resource)} summary={id && <Mono>{id}</Mono>} />;
}
export const deleteViews = {
  input: { headerRenderer: DeleteHeader }, execution: { headerRenderer: DeleteHeader }, result: { headerRenderer: DeleteHeader },
} satisfies ToolRendererDefinition<{ deletedId: string }, { id: string }>;

/* ---------- reading ---------- */

const statusFilter = (target: Json) => {
  const status = inputField(target, "status");
  return Array.isArray(status) ? statusOrder.filter(value => status.includes(value)) : [];
};
function FilterIcons({ target }: { target: Json }) {
  const statuses = statusFilter(target), assignee = inputField(target, "assignee");
  const i18n = useI18n();
  if (!statuses.length && assignee === undefined) return null;
  return <span className="inline-flex items-center gap-1">
    {statuses.map(status => <TodoStatusIcon key={status} status={status} />)}
    {assignee !== undefined && <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden />
      {assignee === "self" ? i18n.text(messages.self) : assignee === "unassigned" ? i18n.text(messages.unassigned)
        : typeof assignee === "object" && assignee && !Array.isArray(assignee) && typeof assignee.title === "string" ? assignee.title : i18n.text(messages.user)}
    </span>}
  </span>;
}
function TaskRows({ todos }: { todos: readonly TodoSummary[] }) {
  const i18n = useI18n();
  return <ul className="flex max-h-80 min-w-0 flex-col gap-1 overflow-y-auto">
    {todos.map(todo => <li key={todo.id} className="flex min-w-0 items-center gap-2">
      <TodoStatusIcon status={todo.status} />
      <span className="min-w-0 flex-1 truncate" title={todo.title}>{todo.title}</span>
      {todo.assignee && <span className="type-caption shrink-0 truncate">{actorName(i18n, todo.assignee)}</span>}
    </li>)}
  </ul>;
}

type PageProps = ToolRenderProps<z.output<typeof TodoListItems.schema>>;
function PageHeader({ target, invocation, result }: PageProps) {
  const i18n = useI18n(), data = result?.data;
  return <ToolHeader label={i18n.text(messages.listTasks)} subject={useToolResourceSubject(invocation.resource)}
    summary={<FilterIcons target={target} />}
    meta={data && i18n.formatMessage(messages.shown, { shown: data.todos.length, total: data.total })} />;
}
function PageBody({ result }: PageProps) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  return data.todos.length ? <TaskRows todos={data.todos} /> : <p className="type-caption">{i18n.text(messages.noTasks)}</p>;
}
export const pageViews = {
  input: { headerRenderer: PageHeader }, execution: { headerRenderer: PageHeader },
  result: { headerRenderer: PageHeader, bodyRenderer: PageBody },
} satisfies ToolRendererDefinition<z.output<typeof TodoListItems.schema>>;

type ReadProps = ToolRenderProps<z.output<typeof TodoRead.schema>>;
function ReadHeader(props: ReadProps) {
  const i18n = useI18n(), data = props.result?.data;
  const id = inputText(props.target, "id");
  return <ToolHeader label={i18n.text(messages.read)} subject={useToolResourceSubject(props.invocation.resource)}
    summary={data ? data.todo.title : id && <Mono>{id}</Mono>}
    meta={data && <span className="inline-flex items-center gap-1.5"><TodoStatusIcon status={data.todo.status} />
      {i18n.formatMessage(messages.lines, { shown: data.content.rows.length, total: data.content.totalLines })}</span>} />;
}
/** Reads the selected Markdown as people would see it; edit anchors stay in the model projection. */
function ReadBody({ result }: ReadProps) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  const { todo, content } = data;
  return <div className="flex min-w-0 flex-col gap-3">
    <Holder actor={todo.assignee} />
    {content.rows.length ? <MarkdownBody text={content.rows.map(displayText).join("\n")} /> : <p className="type-caption">{i18n.text(messages.noContent)}</p>}
    {todo.completion && <div className="flex flex-col gap-1.5 border-l-2 border-success/60 pl-3">
      <p className="type-label">{i18n.formatMessage(messages.completedBy, { actor: actorName(i18n, todo.completion.completedBy) })}</p>
      {todo.completion.note && <MarkdownBody text={todo.completion.note} />}
    </div>}
  </div>;
}
export const readViews = {
  input: { headerRenderer: ReadHeader }, execution: { headerRenderer: ReadHeader }, result: { headerRenderer: ReadHeader, bodyRenderer: ReadBody },
} satisfies ToolRendererDefinition<z.output<typeof TodoRead.schema>>;

type GrepProps = ToolRenderProps<z.output<typeof TodoGrep.schema>>;
function GrepHeader({ args, target, invocation, result }: GrepProps) {
  const i18n = useI18n(), data = result?.data, pattern = inputText(args, "pattern");
  const count = data?.matches.reduce((sum, group) => sum + group.rows.filter(row => row.match).length, 0);
  return <ToolHeader label={i18n.text(messages.search)} subject={useToolResourceSubject(invocation.resource)}
    summary={<span className="inline-flex min-w-0 items-center gap-2">{pattern !== undefined && <span className="truncate font-mono">"{pattern}"</span>}<FilterIcons target={target} /></span>}
    meta={data && i18n.formatMessage(messages.matches, { count: count ?? 0, tasks: data.matches.length, truncated: data.stopReason !== null })} />;
}
/** One group per task under its title; context lines are dimmed. */
function GrepBody({ result }: GrepProps) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  if (!data.matches.length) return <p className="type-caption">{i18n.text(messages.noMatches)}</p>;
  let budget = TOOL_BODY_LINE_LIMIT;
  return <div className="flex min-w-0 flex-col gap-3">{data.matches.map(group => {
    const rows = group.rows.slice(0, Math.max(0, budget)); budget -= rows.length;
    if (!rows.length) return null;
    const segments: (typeof rows)[] = [];
    for (const row of rows) {
      const last = segments.at(-1);
      if (last && last.at(-1)!.line + 1 === row.line) last.push(row); else segments.push([row]);
    }
    return <section key={group.target.id} className="flex min-w-0 flex-col gap-1">
      <p className="type-label truncate" title={group.title}>{group.title}</p>
      {segments.map(segment => <CodeRows key={segment[0]!.line} filename="task.md"
        rows={segment.map(row => ({ line: row.line, content: displayText(row) }))}
        dimmed={segment.flatMap((row, index) => row.match ? [] : [index])} />)}
    </section>;
  })}</div>;
}
export const grepViews = {
  input: { headerRenderer: GrepHeader }, execution: { headerRenderer: GrepHeader }, result: { headerRenderer: GrepHeader, bodyRenderer: GrepBody },
} satisfies ToolRendererDefinition<z.output<typeof TodoGrep.schema>>;

/* ---------- shared lists ---------- */

function ListCounts({ list }: { list: TodoList }) {
  return <span className="inline-flex shrink-0 items-center gap-2 tabular-nums">
    {statusOrder.map(status => <span key={status} className="inline-flex items-center gap-1"><TodoStatusIcon status={status} />{list.counts[status]}</span>)}
  </span>;
}
type ListsProps = ToolRenderProps<z.output<typeof BrowseTodoLists.output>>;
function ListsHeader({ result }: ListsProps) {
  const i18n = useI18n(), lists = result?.data;
  return <ToolHeader label={i18n.text(messages.sharedLists)} meta={lists && i18n.formatMessage(messages.listCount, { count: lists.length })} />;
}
function ListsBody({ result }: ListsProps) {
  const i18n = useI18n(), lists = result?.data;
  if (!lists) return null;
  if (!lists.length) return <p className="type-caption">{i18n.text(messages.noLists)}</p>;
  return <ul className="flex max-h-80 min-w-0 flex-col gap-1 overflow-y-auto">{lists.map(list => <li key={list.id} className="flex min-w-0 items-center gap-2">
    <span className="min-w-0 flex-1 truncate" title={list.title}>{list.title}</span><ListCounts list={list} />
  </li>)}</ul>;
}
export const listsViews = {
  input: { headerRenderer: ListsHeader }, execution: { headerRenderer: ListsHeader }, result: { headerRenderer: ListsHeader, bodyRenderer: ListsBody },
} satisfies ToolRendererDefinition<z.output<typeof BrowseTodoLists.output>>;

type CreateListProps = ToolRenderProps<z.output<typeof CreateSharedTodoList.output>>;
function CreateListHeader({ args, result }: CreateListProps) {
  const i18n = useI18n(), list = result?.data;
  const limit = list ? list.maxCompletedItems : inputField(args, "maxCompletedItems");
  return <ToolHeader label={i18n.text(messages.newList)} summary={list?.title ?? inputText(args, "title")}
    meta={typeof limit === "number" && i18n.formatMessage(messages.retains, { count: limit })} />;
}
export const createListViews = {
  input: { headerRenderer: CreateListHeader }, execution: { headerRenderer: CreateListHeader }, result: { headerRenderer: CreateListHeader },
} satisfies ToolRendererDefinition<z.output<typeof CreateSharedTodoList.output>>;

type DeleteListProps = ToolRenderProps<z.output<typeof DeleteSharedTodoList.output>>;
function DeleteListHeader({ args, result }: DeleteListProps) {
  const i18n = useI18n(), id = inputText(args, "listId"), destination = inputText(args, "transferOpenTodosTo");
  return <ToolHeader label={i18n.text(messages.deleteList)}
    summary={id && <span className="inline-flex items-center gap-1.5"><Mono>{id}</Mono>{destination && <><ArrowRight className="size-3" aria-hidden /><Mono>{destination}</Mono></>}</span>}
    meta={result?.data && destination !== undefined && i18n.formatMessage(messages.transferred, { count: result.data.transferred })} />;
}
export const deleteListViews = {
  input: { headerRenderer: DeleteListHeader }, execution: { headerRenderer: DeleteListHeader }, result: { headerRenderer: DeleteListHeader },
} satisfies ToolRendererDefinition<z.output<typeof DeleteSharedTodoList.output>>;
