import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { splitResourceEventText } from "@asterism-app/builtin-api/contracts";
import type { Actor, Todo, TodoList } from "./model.ts";
import { mutationToModel, notificationText, pageToModel } from "./format.ts";

const agent = (sessionId: string, title: string): Extract<Actor, { kind: "agent" }> => ({ kind: "agent", ref: { sessionId, id: "worker", kind: "asterism.builtin/agent" }, title });
const list: TodoList = { id: "list", title: "Release", maxCompletedItems: null, createdAt: "2026-01-01T00:00:00.000Z", counts: { pending: 0, in_progress: 0, done: 1 } };
const task = (assignee: Actor | null, extra: Partial<Todo> = {}): Todo => ({
  id: "t1", listId: "list", title: "Ship", content: "", status: "pending", assignee, completion: null,
  createdBy: { kind: "user" }, createdAt: "2026-01-01T00:00:00.000Z", updatedBy: { kind: "user" }, updatedAt: "2026-01-02T03:04:05.000Z", ...extra,
});

describe("Todo model projections", () => {
  it("numbers distinct Agent identities once so same-titled Agents in different sessions stay distinguishable", () => {
    const a = agent("a", "Worker"), b = agent("b", "Worker");
    const text = pageToModel({ todos: [task(a), { ...task(b), id: "t2" }, { ...task(a), id: "t3" }], total: 4, nextOffset: 3 });
    expect(text.split("\n")).toEqual([
      "3 of 4 matching tasks",
      't1 · pending · "Ship" · assignee Worker [1] · created by user · updated 2026-01-02 03:04Z',
      't2 · pending · "Ship" · assignee Worker [2] · created by user · updated 2026-01-02 03:04Z',
      't3 · pending · "Ship" · assignee Worker [1] · created by user · updated 2026-01-02 03:04Z',
      "More tasks start at target.offset:3.",
      "Agent identities, usable as assignee filters:",
      '[1] {"kind":"agent","ref":{"sessionId":"a","id":"worker","kind":"asterism.builtin/agent"}}',
      '[2] {"kind":"agent","ref":{"sessionId":"b","id":"worker","kind":"asterism.builtin/agent"}}',
    ]);
  });

  it("distinguishes an unchanged call and immediate retention removal from a normal transition", () => {
    const done = task(null, { status: "done" });
    expect(mutationToModel("Completed")({ changed: true, todo: done, retained: true })).toBe('Completed t1 "Ship" · done · assignee unassigned');
    expect(mutationToModel("Completed")({ changed: false, todo: done, retained: true })).toBe('No change: t1 "Ship" · done · assignee unassigned');
    expect(mutationToModel("Completed")({ changed: true, todo: done, retained: false }).split("\n")).toHaveLength(2);
  });

  it("puts identifiers in frontmatter and the readable sentence and completion note in the body", () => {
    const actor = agent("a", "Reviewer");
    const todo = task(actor, { status: "done", completion: { note: "All checks pass.", completedBy: actor, completedAt: "2026-01-03T00:00:00.000Z" } });
    const { metadata, body } = splitResourceEventText(notificationText(list, { kind: "completed", todo, actor }));
    expect(parse(metadata!)).toEqual({ event: "todo.completed", list: "list", task: "t1", status: "done",
      assignee: { kind: "agent", ref: actor.ref, title: "Reviewer" }, actor: { kind: "agent", ref: actor.ref, title: "Reviewer" } });
    expect(body).toBe("Reviewer completed **Ship** in Release\n\nAll checks pass.");
  });
});
