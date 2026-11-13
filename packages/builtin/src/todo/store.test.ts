import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { TodoStore } from "./store.ts";
import type { Actor, TodoChange, TodoFilter } from "./model.ts";

const user: Actor = { kind: "user" };
const alice: Actor = { kind: "agent", ref: { sessionId: "session-a", id: "agent-a", kind: "agent" }, title: "Alice" };
const bob: Actor = { kind: "agent", ref: { sessionId: "session-b", id: "agent-b", kind: "agent" }, title: "Bob" };
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup(maxCompletedItems: number | null = null) {
  const db = new DatabaseSync(":memory:"), changes: TodoChange[] = [];
  databases.push(db);
  const store = new TodoStore(db, change => {
    // Starting a transaction here fails if the callback runs before commit.
    db.exec("BEGIN; ROLLBACK;");
    changes.push(change);
  });
  const list = store.createList({ title: "Work", maxCompletedItems });
  const create = (title: string, actor = alice) => store.create(list.id, { title, content: `Content for ${title}` }, actor).todo;
  const page = (filter: TodoFilter = {}, offset = 0, limit = 100, self = alice) => store.page(list.id, { ...filter, offset, limit }, self);
  changes.length = 0;
  return { db, store, changes, list, create, page };
}
function reason(run: () => unknown, expected: string) {
  expect(run).toThrow(expect.objectContaining({ reason: expected }));
}

describe("shared Todo persistence", () => {
  it("reads current SQL state across store instances and aggregates current counts including empty lists", () => {
    const { db, store, list, create } = setup();
    const empty = store.createList({ title: "Empty", maxCompletedItems: null });
    const first = create("First"), second = create("Second"), third = create("Third", user);
    const other = new TodoStore(db);
    other.claim(list.id, second.id, bob);
    other.complete(list.id, third.id, undefined, user);
    other.write(list.id, first.id, "Updated elsewhere", user);
    expect(store.get(list.id, first.id).content).toBe("Updated elsewhere");
    expect(store.requireList(list.id).counts).toEqual({ pending: 1, in_progress: 1, done: 1 });
    expect(store.lists()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: list.id, counts: { pending: 1, in_progress: 1, done: 1 } }),
      expect.objectContaining({ id: empty.id, counts: { pending: 0, in_progress: 0, done: 0 } }),
    ]));
    other.delete(list.id, second.id);
    expect(store.requireList(list.id).counts.in_progress).toBe(0);
    expect(first).toMatchObject({ status: "pending", assignee: null, completion: null, createdBy: alice, updatedBy: alice });
  });

  it("compares claim ownership by stable identity, preserves the stored title on no-op, and reports conflicting holders", () => {
    const { store, changes, list, create } = setup();
    const task = create("Claim me");
    const claimed = store.claim(list.id, task.id, alice);
    const renamed: Actor = { ...alice, title: "Renamed Alice" };
    changes.length = 0;
    expect(store.claim(list.id, task.id, renamed)).toEqual({ ...claimed, changed: false });
    for (const stranger of [bob, user, { ...alice, ref: { ...alice.ref, sessionId: "other-session" } },
      { ...alice, ref: { ...alice.ref, kind: "different-kind" } }]) {
      expect(() => store.claim(list.id, task.id, stranger)).toThrow(expect.objectContaining({
        code: "conflict", message: expect.stringContaining("in_progress; current holder: Alice"),
      }));
    }
    expect(changes).toEqual([]);
    expect(store.get(list.id, task.id)).toEqual(claimed.todo);
    store.release(list.id, task.id, bob);
    const userClaim = store.claim(list.id, task.id, user);
    expect(store.claim(list.id, task.id, { kind: "user" })).toEqual({ ...userClaim, changed: false });
  });

  it("allows any caller to release, rejects incompatible transitions, and clears assignment on reopen", () => {
    const { store, changes, list, create } = setup();
    const task = create("Transitions");
    expect(store.release(list.id, task.id, bob)).toEqual({ changed: false, todo: task, retained: true });
    expect(store.reopen(list.id, task.id, user).changed).toBe(false);
    store.claim(list.id, task.id, alice);
    reason(() => store.reopen(list.id, task.id, bob), "todo_status_conflict");
    const released = store.release(list.id, task.id, bob).todo;
    expect(released).toMatchObject({ status: "pending", assignee: null, updatedBy: bob });
    store.claim(list.id, task.id, alice);
    const done = store.complete(list.id, task.id, "Finished", bob).todo;
    expect(done).toMatchObject({ status: "done", assignee: alice, completion: { note: "Finished", completedBy: bob } });
    expect(() => store.claim(list.id, task.id, alice)).toThrow("done; current holder: Alice");
    expect(() => store.release(list.id, task.id, user)).toThrow("done; current holder: Alice");
    const reopened = store.reopen(list.id, task.id, user).todo;
    expect(reopened).toMatchObject({ status: "pending", assignee: null, completion: null, updatedBy: user });
    expect(changes.flatMap(change => change.notification ? [change.notification.kind] : [])).toEqual(["created", "completed", "reopened"]);
  });

  it("ignores identical completion notes across callers, replaces different notes, and edits done content without reopening", () => {
    const { store, changes, list, create } = setup();
    const task = create("Immutable title");
    const done = store.complete(list.id, task.id, undefined, bob);
    expect(done.todo).toMatchObject({ assignee: null, completion: { note: null, completedBy: bob } });
    changes.length = 0;
    expect(store.complete(list.id, task.id, undefined, user)).toEqual({ ...done, changed: false });
    expect(store.write(list.id, task.id, task.content, user)).toEqual({ ...done, changed: false });
    expect(changes).toEqual([]);
    const revised = store.complete(list.id, task.id, "", user).todo;
    expect(revised.completion).toMatchObject({ note: "", completedBy: user });
    const written = store.write(list.id, task.id, "New Markdown", alice).todo;
    expect(written).toEqual({ ...revised, content: "New Markdown", updatedBy: alice, updatedAt: written.updatedAt });
    expect(written.title).toBe(task.title);
    expect(changes.map(change => change.notification?.kind)).toEqual(["completed", undefined]);
    expect(changes[0]?.notification).toMatchObject({ actor: user, todo: revised });
    expect(store.complete(list.id, task.id, undefined, bob).todo.completion).toMatchObject({ note: null, completedBy: bob });
  });

  it("pages by creation time then ID and intersects SQL status and stable-assignee filters", () => {
    const { db, store, list, create, page } = setup();
    const tasks = [create("Alpha"), create("Beta"), create("Gamma"), create("Delta")];
    const [a, b, c, d] = tasks;
    store.claim(list.id, a!.id, alice);
    store.claim(list.id, b!.id, bob);
    store.complete(list.id, b!.id, "done", user);
    store.claim(list.id, c!.id, user);
    db.prepare("UPDATE todo_items SET created_at = ? WHERE list_id = ?").run("2000-01-01T00:00:00.000Z", list.id);
    const sorted = tasks.map(task => task.id).sort();
    const first = page({}, 0, 2), second = page({}, first.nextOffset!, 2);
    expect(first.todos.map(task => task.id)).toEqual(sorted.slice(0, 2));
    expect(first).toMatchObject({ total: 4, nextOffset: 2 });
    expect(second.todos.map(task => task.id)).toEqual(sorted.slice(2));
    expect(second.nextOffset).toBeNull();
    expect(page({}, 10, 2)).toEqual({ todos: [], total: 4, nextOffset: null });
    expect(page({ status: [] })).toEqual({ todos: [], total: 0, nextOffset: null });
    expect(page({ assignee: "self" }).todos.map(task => task.id)).toEqual([a!.id]);
    expect(page({ assignee: "self" }, 0, 100, user).todos.map(task => task.id)).toEqual([c!.id]);
    expect(page({ assignee: "unassigned" }).todos.map(task => task.id)).toEqual([d!.id]);
    expect(page({ assignee: bob, status: ["in_progress"] }).total).toBe(0);
    expect(page({ assignee: bob, status: ["done", "pending"] }).todos.map(task => task.id)).toEqual([b!.id]);
    expect(page({ assignee: { ...alice, ref: { ...alice.ref, sessionId: "elsewhere" } } }).total).toBe(0);
    expect([...store.contents(list.id, { assignee: "self" }, bob)]).toEqual([store.get(list.id, b!.id)]);
    expect([...store.contents(list.id, { status: [] }, alice)]).toEqual([]);
    const other = store.createList({ title: "Other", maxCompletedItems: null });
    store.create(other.id, { title: "Excluded", content: "Hidden" }, alice);
    expect(page().total).toBe(4);
  });

  it.each(["pending", "in_progress", "done"] as const)("deletes a %s task only in its bound list without a notification", status => {
    const { store, changes, list, create } = setup();
    const task = create("Delete me");
    if (status === "in_progress") store.claim(list.id, task.id, alice);
    if (status === "done") store.complete(list.id, task.id, undefined, bob);
    const other = store.createList({ title: "Other", maxCompletedItems: null });
    changes.length = 0;
    reason(() => store.delete(other.id, task.id), "todo_not_found");
    expect(store.get(list.id, task.id).status).toBe(status);
    expect(store.delete(list.id, task.id)).toEqual({ deletedId: task.id });
    reason(() => store.get(list.id, task.id), "todo_not_found");
    expect(changes).toEqual([{ listIds: [list.id] }]);
  });

  it("retains unlimited completed tasks by default and reports immediate pruning at a zero limit", () => {
    const { store, list, create, changes } = setup();
    const ids = Array.from({ length: 3 }, (_, i) => create(`Task ${i}`).id);
    for (const id of ids) expect(store.complete(list.id, id, undefined, user).retained).toBe(true);
    expect(store.requireList(list.id).counts.done).toBe(3);
    const zero = store.createList({ title: "Ephemeral", maxCompletedItems: 0 });
    const task = store.create(zero.id, { title: "Complete and discard", content: "body" }, alice).todo;
    const result = store.complete(zero.id, task.id, "Delivered", bob);
    expect(result).toMatchObject({ changed: true, retained: false, todo: { id: task.id, status: "done", completion: { note: "Delivered" } } });
    reason(() => store.get(zero.id, task.id), "todo_not_found");
    expect(store.requireList(zero.id).counts).toEqual({ pending: 0, in_progress: 0, done: 0 });
    expect(changes.at(-1)).toEqual({ listIds: [zero.id], notification: { kind: "completed", todo: result.todo, actor: bob } });
  });

  it("retains by completion order rather than creation and refreshes that order on note replacement", () => {
    const { db, store, list, create } = setup(2);
    const first = create("First"), second = create("Second"), third = create("Third");
    store.complete(list.id, second.id, undefined, user);
    store.complete(list.id, first.id, undefined, user);
    db.prepare("UPDATE todo_items SET completed_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", second.id);
    db.prepare("UPDATE todo_items SET completed_at = ? WHERE id = ?").run("2001-01-01T00:00:00.000Z", first.id);
    store.complete(list.id, second.id, "Refreshed", bob);
    expect(store.complete(list.id, third.id, undefined, user).retained).toBe(true);
    reason(() => store.get(list.id, first.id), "todo_not_found");
    expect(store.get(list.id, second.id).completion?.note).toBe("Refreshed");
    expect(store.requireList(list.id).counts.done).toBe(2);
  });

  it("prunes completion ties by ID on creation without deleting open tasks or other lists", () => {
    const { db, store, list, create, changes } = setup();
    const completed = [create("A"), create("B"), create("C")];
    for (const task of completed) store.complete(list.id, task.id, undefined, user);
    const open = create("Open");
    store.claim(list.id, open.id, alice);
    const other = store.createList({ title: "Other", maxCompletedItems: null });
    const elsewhere = store.create(other.id, { title: "Elsewhere", content: "" }, user).todo;
    store.complete(other.id, elsewhere.id, undefined, user);
    db.prepare("UPDATE todo_lists SET max_completed_items = 1 WHERE id = ?").run(list.id);
    db.prepare("UPDATE todo_items SET completed_at = ? WHERE list_id = ? AND status = 'done'").run("2000-01-01T00:00:00.000Z", list.id);
    changes.length = 0;
    const added = create("Trigger cleanup");
    const kept = completed.map(task => task.id).sort().at(-1)!;
    expect([...store.contents(list.id, { status: ["done"] }, user)].map(task => task.id)).toEqual([kept]);
    expect(store.get(list.id, open.id).status).toBe("in_progress");
    expect(store.get(other.id, elsewhere.id).status).toBe("done");
    expect(store.get(list.id, added.id).status).toBe("pending");
    expect(changes).toEqual([{ listIds: [list.id], notification: { kind: "created", todo: added, actor: alice } }]);
  });

  it("rolls back completion and creation if retention cleanup fails, without callbacks", () => {
    const { db, store, list, create, changes } = setup(0);
    const task = create("Rollback");
    db.exec("CREATE TRIGGER prevent_prune BEFORE DELETE ON todo_items BEGIN SELECT RAISE(ABORT, 'prune blocked'); END;");
    changes.length = 0;
    expect(() => store.complete(list.id, task.id, undefined, user)).toThrow("prune blocked");
    expect(store.get(list.id, task.id)).toEqual(task);
    expect(changes).toEqual([]);
    db.prepare("UPDATE todo_lists SET max_completed_items = NULL WHERE id = ?").run(list.id);
    store.complete(list.id, task.id, undefined, user);
    db.prepare("UPDATE todo_lists SET max_completed_items = 0 WHERE id = ?").run(list.id);
    changes.length = 0;
    expect(() => create("Must not survive")).toThrow("prune blocked");
    expect([...store.contents(list.id, {}, user)].map(value => value.id)).toEqual([task.id]);
    expect(changes).toEqual([]);
  });

  it("transfers only open tasks atomically, preserving all metadata and emitting one non-notifying change", () => {
    const { store, list, create, changes } = setup();
    const pending = create("Pending"), active = create("Active"), done = create("Done");
    const claimed = store.claim(list.id, active.id, bob).todo;
    store.complete(list.id, done.id, undefined, user);
    const destination = store.createList({ title: "Destination", maxCompletedItems: 0 });
    changes.length = 0;
    expect(store.deleteList({ listId: list.id, transferOpenTodosTo: destination.id })).toEqual({ deletedListId: list.id, transferred: 2 });
    expect(store.get(destination.id, pending.id)).toEqual({ ...pending, listId: destination.id });
    expect(store.get(destination.id, active.id)).toEqual({ ...claimed, listId: destination.id });
    expect(store.getList(list.id)).toBeNull();
    reason(() => store.get(list.id, pending.id), "todo_list_not_found");
    reason(() => store.get(destination.id, done.id), "todo_not_found");
    reason(() => store.requireList(list.id), "todo_list_not_found");
    reason(() => store.page(list.id, { offset: 0, limit: 1 }, user), "todo_list_not_found");
    expect(changes).toEqual([{ listIds: [list.id, destination.id] }]);
  });

  it("rejects unavailable or identical transfer destinations and rolls back a transfer if deletion fails", () => {
    const { db, store, list, create, changes } = setup();
    const task = create("Keep me");
    const destination = store.createList({ title: "Destination", maxCompletedItems: null });
    changes.length = 0;
    reason(() => store.deleteList({ listId: list.id, transferOpenTodosTo: "missing" }), "todo_list_not_found");
    expect(() => store.deleteList({ listId: list.id, transferOpenTodosTo: list.id })).toThrow(expect.objectContaining({ code: "invalid_argument" }));
    db.exec("CREATE TRIGGER prevent_list_delete BEFORE DELETE ON todo_lists BEGIN SELECT RAISE(ABORT, 'delete blocked'); END;");
    expect(() => store.deleteList({ listId: list.id, transferOpenTodosTo: destination.id })).toThrow("delete blocked");
    expect(store.get(list.id, task.id)).toEqual(task);
    expect(store.requireList(destination.id).counts.pending).toBe(0);
    expect(changes).toEqual([]);
    db.exec("DROP TRIGGER prevent_list_delete");
    expect(store.deleteList({ listId: list.id })).toEqual({ deletedListId: list.id, transferred: 0 });
    reason(() => store.get(list.id, task.id), "todo_list_not_found");
    expect(store.getList(list.id)).toBeNull();
  });
});
