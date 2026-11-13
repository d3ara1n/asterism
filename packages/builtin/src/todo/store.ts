import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { nanoid } from "nanoid";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { z } from "zod";
import {
  actorKey, type Actor, type Todo, type TodoChange, type TodoFilter, type TodoList, type TodoPage,
  type listCreationSchema, type listDeletionSchema, type todoCreationSchema, type todoPageResultSchema,
} from "./model.ts";

export type Mutation = { changed: boolean; todo: Todo; retained: boolean };
type Summary = z.infer<typeof todoPageResultSchema>["todos"][number];
type SummaryRow = {
  id: string; list_id: string; title: string; status: Todo["status"]; assignee: string | null;
  created_by: string; created_at: string; updated_by: string; updated_at: string;
};
type TodoRow = SummaryRow & { content: string; completion: string | null };
type ListRow = {
  id: string; title: string; max_completed_items: number | null; created_at: string;
  pending: number; in_progress: number; done: number;
};
const summaryColumns = "id, list_id, title, status, assignee, created_by, created_at, updated_by, updated_at";
const listQuery = `SELECT l.*, COUNT(CASE WHEN t.status = 'pending' THEN 1 END) AS pending,
  COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) AS in_progress,
  COUNT(CASE WHEN t.status = 'done' THEN 1 END) AS done
  FROM todo_lists l LEFT JOIN todo_items t ON t.list_id = l.id`;
function summary(row: SummaryRow): Summary {
  return {
    id: row.id, listId: row.list_id, title: row.title, status: row.status,
    assignee: row.assignee === null ? null : JSON.parse(row.assignee) as Actor,
    createdBy: JSON.parse(row.created_by) as Actor, createdAt: row.created_at,
    updatedBy: JSON.parse(row.updated_by) as Actor, updatedAt: row.updated_at,
  };
}
function todo(row: TodoRow): Todo {
  return { ...summary(row), content: row.content, completion: row.completion === null ? null : JSON.parse(row.completion) as Todo["completion"] };
}
function list(row: ListRow): TodoList {
  return { id: row.id, title: row.title, maxCompletedItems: row.max_completed_items, createdAt: row.created_at,
    counts: { pending: row.pending, in_progress: row.in_progress, done: row.done } };
}
function statusError(value: Todo): PluginApiError {
  const holder = value.assignee === null ? "unassigned" : value.assignee.kind === "user" ? "User" : value.assignee.title;
  return new PluginApiError("conflict", `Task ${value.id} is ${value.status}; current holder: ${holder}.`, "todo_status_conflict");
}

/** Shared live SQL state, independent of resource bindings and session history. */
export class TodoStore {
  constructor(private readonly db: DatabaseSync, private readonly onChange?: (change: TodoChange) => void) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS todo_lists (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, max_completed_items INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS todo_items (
        id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES todo_lists(id), title TEXT NOT NULL,
        content TEXT NOT NULL, status TEXT NOT NULL, assignee TEXT, assignee_key TEXT,
        completion TEXT, completed_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS todo_items_list_created ON todo_items(list_id, created_at, id);
      CREATE INDEX IF NOT EXISTS todo_items_list_status ON todo_items(list_id, status, created_at, id);
      CREATE INDEX IF NOT EXISTS todo_items_list_assignee ON todo_items(list_id, assignee_key, created_at, id);
      CREATE INDEX IF NOT EXISTS todo_items_completed ON todo_items(list_id, status, completed_at, id);
    `);
  }

  private transaction<T>(run: () => { result: T; change?: TodoChange }): T {
    this.db.exec("BEGIN");
    let outcome: { result: T; change?: TodoChange };
    try {
      outcome = run();
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    // Notification failure cannot roll back an already committed mutation.
    if (outcome.change) this.onChange?.(outcome.change);
    return outcome.result;
  }

  lists(): TodoList[] {
    return (this.db.prepare(`${listQuery} GROUP BY l.id ORDER BY l.created_at, l.id`).all() as ListRow[]).map(list);
  }
  getList(id: string): TodoList | null {
    const row = this.db.prepare(`${listQuery} WHERE l.id = ? GROUP BY l.id`).get(id) as ListRow | undefined;
    return row ? list(row) : null;
  }
  requireList(id: string): TodoList {
    const value = this.getList(id);
    if (!value) throw new PluginApiError("not_found", `Todo list ${id} was not found.`, "todo_list_not_found");
    return value;
  }
  private requireExists(id: string): void {
    if (!this.db.prepare("SELECT 1 FROM todo_lists WHERE id = ?").get(id))
      throw new PluginApiError("not_found", `Todo list ${id} was not found.`, "todo_list_not_found");
  }
  createList(input: z.infer<typeof listCreationSchema>): TodoList {
    return this.transaction(() => {
      const id = nanoid();
      const value: TodoList = { id, title: input.title, maxCompletedItems: input.maxCompletedItems,
        createdAt: new Date().toISOString(), counts: { pending: 0, in_progress: 0, done: 0 } };
      this.db.prepare("INSERT INTO todo_lists (id, title, max_completed_items, created_at) VALUES (?, ?, ?, ?)")
        .run(id, value.title, value.maxCompletedItems, value.createdAt);
      return { result: value, change: { listIds: [id] } };
    });
  }
  deleteList(input: z.infer<typeof listDeletionSchema>): { deletedListId: string; transferred: number } {
    return this.transaction(() => {
      this.requireExists(input.listId);
      let transferred = 0;
      const destination = input.transferOpenTodosTo;
      if (destination !== undefined) {
        if (destination === input.listId) throw new PluginApiError("invalid_argument", "The transfer destination must be a different Todo list.");
        this.requireExists(destination);
        transferred = Number(this.db.prepare("UPDATE todo_items SET list_id = ? WHERE list_id = ? AND status IN ('pending', 'in_progress')")
          .run(destination, input.listId).changes);
      }
      this.db.prepare("DELETE FROM todo_items WHERE list_id = ?").run(input.listId);
      this.db.prepare("DELETE FROM todo_lists WHERE id = ?").run(input.listId);
      return { result: { deletedListId: input.listId, transferred },
        change: { listIds: destination === undefined ? [input.listId] : [input.listId, destination] } };
    });
  }

  private where(listId: string, filter: TodoFilter, self: Actor): { sql: string; values: SQLInputValue[] } {
    const clauses = ["list_id = ?"], values: SQLInputValue[] = [listId];
    if (filter.status !== undefined) {
      clauses.push(filter.status.length === 0 ? "0" : `status IN (${filter.status.map(() => "?").join(", ")})`);
      values.push(...filter.status);
    }
    if (filter.assignee === "unassigned") clauses.push("assignee_key IS NULL");
    else if (filter.assignee !== undefined) {
      clauses.push("assignee_key = ?");
      values.push(actorKey(filter.assignee === "self" ? self : filter.assignee));
    }
    return { sql: clauses.join(" AND "), values };
  }
  page(listId: string, filter: TodoPage, self: Actor): z.infer<typeof todoPageResultSchema> {
    this.requireExists(listId);
    const { sql, values } = this.where(listId, filter, self);
    const { total } = this.db.prepare(`SELECT COUNT(*) AS total FROM todo_items WHERE ${sql}`).get(...values) as { total: number };
    const rows = this.db.prepare(`SELECT ${summaryColumns} FROM todo_items WHERE ${sql} ORDER BY created_at, id LIMIT ? OFFSET ?`)
      .all(...values, filter.limit, filter.offset) as SummaryRow[];
    const next = filter.offset + rows.length;
    return { todos: rows.map(summary), total, nextOffset: next < total ? next : null };
  }
  contents(listId: string, filter: TodoFilter, self: Actor): Todo[] {
    this.requireExists(listId);
    const { sql, values } = this.where(listId, filter, self);
    return (this.db.prepare(`SELECT * FROM todo_items WHERE ${sql} ORDER BY created_at, id`).all(...values) as TodoRow[]).map(todo);
  }
  get(listId: string, id: string): Todo {
    const row = this.db.prepare("SELECT * FROM todo_items WHERE list_id = ? AND id = ?").get(listId, id) as TodoRow | undefined;
    if (!row) {
      this.requireExists(listId);
      throw new PluginApiError("not_found", `Task ${id} was not found in Todo list ${listId}.`, "todo_not_found");
    }
    return todo(row);
  }

  private prune(listId: string): string[] {
    const row = this.db.prepare("SELECT max_completed_items FROM todo_lists WHERE id = ?").get(listId) as { max_completed_items: number | null };
    const maxCompletedItems = row.max_completed_items;
    if (maxCompletedItems === null) return [];
    const removed = this.db.prepare(`DELETE FROM todo_items WHERE id IN (
      SELECT id FROM todo_items WHERE list_id = ? AND status = 'done'
      ORDER BY completed_at DESC, id DESC LIMIT -1 OFFSET ?
    ) RETURNING id`).all(listId, maxCompletedItems) as { id: string }[];
    return removed.map(row => row.id);
  }
  create(listId: string, input: z.infer<typeof todoCreationSchema>, actor: Actor): Mutation {
    return this.transaction(() => {
      this.requireExists(listId);
      const id = nanoid(), now = new Date().toISOString(), encodedActor = JSON.stringify(actor);
      this.db.prepare(`INSERT INTO todo_items
        (id, list_id, title, content, status, created_by, created_at, updated_by, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`).run(id, listId, input.title, input.content, encodedActor, now, encodedActor, now);
      const value: Todo = { id, listId, title: input.title, content: input.content, status: "pending",
        assignee: null, completion: null, createdBy: actor, createdAt: now, updatedBy: actor, updatedAt: now };
      this.prune(listId);
      return { result: { changed: true, todo: value, retained: true },
        change: { listIds: [listId], notification: { kind: "created", todo: value, actor } } };
    });
  }
  private mutate(listId: string, id: string, actor: Actor,
    update: (value: Todo, now: string) => Partial<Pick<Todo, "content" | "status" | "assignee" | "completion">> | null,
    notification?: "completed" | "reopened"): Mutation {
    return this.transaction<Mutation>(() => {
      const prior = this.get(listId, id), now = new Date().toISOString();
      const patch = update(prior, now);
      if (patch === null) return { result: { changed: false, todo: prior, retained: true } };
      const value: Todo = { ...prior, ...patch, updatedBy: actor, updatedAt: now };
      this.db.prepare(`UPDATE todo_items SET content = ?, status = ?, assignee = ?, assignee_key = ?,
        completion = ?, completed_at = ?, updated_by = ?, updated_at = ? WHERE list_id = ? AND id = ?`)
        .run(value.content, value.status, value.assignee === null ? null : JSON.stringify(value.assignee),
          value.assignee === null ? null : actorKey(value.assignee), value.completion === null ? null : JSON.stringify(value.completion),
          value.completion?.completedAt ?? null, JSON.stringify(actor), now, listId, id);
      const removed = notification === "completed" ? this.prune(listId) : [];
      const retained = !removed.includes(id);
      return { result: { changed: true, todo: value, retained }, change: { listIds: [listId],
        ...(notification === undefined ? {} : { notification: { kind: notification, todo: value, actor } }) } };
    });
  }
  write(listId: string, id: string, content: string, actor: Actor): Mutation {
    return this.mutate(listId, id, actor, value => value.content === content ? null : { content });
  }
  claim(listId: string, id: string, actor: Actor): Mutation {
    return this.mutate(listId, id, actor, value => {
      if (value.status === "in_progress" && value.assignee !== null && actorKey(value.assignee) === actorKey(actor)) return null;
      if (value.status !== "pending" || value.assignee !== null) throw statusError(value);
      return { status: "in_progress", assignee: actor };
    });
  }
  release(listId: string, id: string, actor: Actor): Mutation {
    return this.mutate(listId, id, actor, value => {
      if (value.status === "pending") return null;
      if (value.status === "done") throw statusError(value);
      return { status: "pending", assignee: null };
    });
  }
  complete(listId: string, id: string, note: string | undefined, actor: Actor): Mutation {
    return this.mutate(listId, id, actor, (value, now) => {
      if (value.status === "done" && value.completion?.note === (note ?? null)) return null;
      return { status: "done", completion: { note: note ?? null, completedBy: actor, completedAt: now } };
    }, "completed");
  }
  reopen(listId: string, id: string, actor: Actor): Mutation {
    return this.mutate(listId, id, actor, value => {
      if (value.status === "pending") return null;
      if (value.status === "in_progress") throw statusError(value);
      return { status: "pending", assignee: null, completion: null };
    }, "reopened");
  }
  delete(listId: string, id: string): { deletedId: string } {
    return this.transaction(() => {
      const removed = this.db.prepare("DELETE FROM todo_items WHERE list_id = ? AND id = ? RETURNING id").get(listId, id);
      if (!removed) {
        this.requireExists(listId);
        throw new PluginApiError("not_found", `Task ${id} was not found in Todo list ${listId}.`, "todo_not_found");
      }
      return { result: { deletedId: id }, change: { listIds: [listId] } };
    });
  }
}
