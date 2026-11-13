import type { z } from "zod";
import type { Json } from "@asterism-app/sdk/contracts";
import { resourceEventText, type TextRead } from "@asterism-app/builtin-api/contracts";
import { readToModel } from "../shared/text.ts";
import type { Actor, Todo, TodoList, TodoNotification, TodoSummary, todoPageResultSchema } from "./model.ts";

/**
 * Compact model projections. Agent actors read as their title plus a numbered identity whose JSON
 * appears once at the end, so repeated or same-named actors stay distinct without repeating references.
 */
export class ActorLegend {
  private readonly keys = new Map<string, number>();
  private readonly identities: string[] = [];
  label(actor: Actor | null): string {
    if (actor === null) return "unassigned";
    if (actor.kind === "user") return "user";
    const key = JSON.stringify(actor.ref);
    let index = this.keys.get(key);
    if (index === undefined) {
      index = this.identities.push(JSON.stringify({ kind: "agent", ref: actor.ref })); this.keys.set(key, index);
    }
    return `${actor.title} [${index}]`;
  }
  lines(): string[] {
    return this.identities.length ? ["Agent identities, usable as assignee filters:", ...this.identities.map((identity, index) => `[${index + 1}] ${identity}`)] : [];
  }
}
/** Mutation results describe the caller's own change, where a title is enough to name each actor. */
const plain = (actor: Actor | null) => actor === null ? "unassigned" : actor.kind === "user" ? "user" : actor.title;
/** ISO timestamps from the store are UTC; minutes are enough to order and age tasks. */
export const moment = (iso: string) => `${iso.slice(0, 16).replace("T", " ")}Z`;
const quoted = (title: string) => JSON.stringify(title);

function summaryLine(todo: TodoSummary, actors: ActorLegend): string {
  return [todo.id, todo.status, quoted(todo.title), `assignee ${actors.label(todo.assignee)}`,
    `created by ${actors.label(todo.createdBy)}`, `updated ${moment(todo.updatedAt)}`].join(" · ");
}
export function pageToModel(data: z.infer<typeof todoPageResultSchema>): string {
  const actors = new ActorLegend();
  const rows = data.todos.map(todo => summaryLine(todo, actors));
  return [
    data.todos.length ? `${data.todos.length} of ${data.total} matching tasks` : data.total ? `No tasks on this page; ${data.total} match.` : "No matching tasks.",
    ...rows,
    ...(data.nextOffset === null ? [] : [`More tasks start at target.offset:${data.nextOffset}.`]),
    ...actors.lines(),
  ].join("\n");
}
export function readTodoToModel({ todo, content }: { todo: Omit<Todo, "content">; content: TextRead }): string {
  const actors = new ActorLegend();
  const lines = [
    [todo.id, todo.status, quoted(todo.title)].join(" · "),
    [`assignee ${actors.label(todo.assignee)}`, `created by ${actors.label(todo.createdBy)} ${moment(todo.createdAt)}`,
      `updated by ${actors.label(todo.updatedBy)} ${moment(todo.updatedAt)}`].join(" · "),
  ];
  if (todo.completion) {
    lines.push(`Completed by ${actors.label(todo.completion.completedBy)} ${moment(todo.completion.completedAt)}${todo.completion.note === null ? " · no note" : "; note:"}`);
    if (todo.completion.note !== null) lines.push(todo.completion.note);
  }
  lines.push("", `Content: ${readToModel(content)}`, ...actors.lines());
  return lines.join("\n");
}

export type MutationResult = { changed: boolean; todo: Todo; retained: boolean };
/** One line naming the transition and the resulting state; unchanged calls state the current state instead. */
export function mutationToModel(verb: string) {
  return ({ changed, todo, retained }: MutationResult): string => [
    `${changed ? verb : "No change:"} ${todo.id} ${quoted(todo.title)} · ${todo.status} · assignee ${plain(todo.assignee)}`,
    ...(retained ? [] : ["The list's completed-task retention removed this task immediately."]),
  ].join("\n");
}

const retention = (list: TodoList) => list.maxCompletedItems === null ? "retains all completed" : `retains ${list.maxCompletedItems} completed`;
export function listToModel(list: TodoList): string {
  return [list.id, quoted(list.title), `${list.counts.pending} pending`, `${list.counts.in_progress} in_progress`,
    `${list.counts.done} done`, retention(list)].join(" · ");
}
export function listsToModel(lists: TodoList[]): string {
  return lists.length ? lists.map(listToModel).join("\n") : "No shared lists.";
}

const identity = (actor: Actor | null): Json => actor === null ? null : actor.kind === "user" ? "user" : { kind: "agent", ref: actor.ref, title: actor.title };
const verbs = { created: "created", completed: "completed", reopened: "reopened" } as const;
/**
 * Frontmatter carries identifiers for tools and filters; the Markdown body is what people read:
 * who did what to which task, and the completion note when one was written.
 */
export function notificationText(list: TodoList, { kind, todo, actor }: TodoNotification): string {
  const note = kind === "completed" ? todo.completion?.note ?? null : null;
  const body = [`${plain(actor)} ${verbs[kind]} **${todo.title}** in ${list.title}`];
  if (note) body.push("", note);
  return resourceEventText({
    event: `todo.${kind}`, list: list.id, task: todo.id, status: todo.status, assignee: identity(todo.assignee), actor: identity(actor),
  }, body.join("\n"));
}
