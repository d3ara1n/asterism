import { nanoid } from "nanoid";
import { z } from "zod";
import { SubmitAgentInput } from "@asterism-app/builtin-api/contracts";
import { defineAgentCreation } from "@asterism-app/builtin-api/runtime";
import { defineModule, defineTopLevelTool, implementAction, implementCall, implementCreation, implementResource, implementTool,
  PluginApiError, type CallResult, type ObjectReader, type ToolCaller } from "@asterism-app/sdk/runtime";
import type { Json, ResourceRef, ResourceSnapshot } from "@asterism-app/sdk/contracts";
import { todoListCard } from "../shared/card-appearance.ts";
import { TextError, readText, editText, textChange, editToModel, writeToModel } from "../shared/text.ts";
import { FilesystemError } from "../filesystem/errors.ts";
import { BrowseTodoLists, CreateSharedTodoList, CreateTodoListResource, DeleteSharedTodoList, MutateTodo,
  ReadTodoItem, ReadTodoPage, TodoClaim, TodoComplete, TodoCreate, TodoDelete, TodoEdit, TodoGrep, TodoListItems,
  TodoListResource, TodoListView, TodoRead, TodoRelease, TodoReopen, TodoWrite } from "./contract.ts";
import { actorKey, listCreationSchema, listDeletionSchema, todoListSchema, todoPageSchema,
  type Actor, type TodoChange } from "./model.ts";
import { TodoStore } from "./store.ts";
import { grepTodos, todoGrepToModel } from "./search.ts";
import { notificationRoutes } from "./notifications.ts";
import { listToModel, listsToModel, mutationToModel, notificationText, pageToModel, readTodoToModel } from "./format.ts";

const user: Actor = { kind: "user" };
const agent = (caller: ToolCaller): Actor => ({ kind: "agent", ref: { ...caller.ref }, title: caller.title });
const keyOf = (ref: ResourceRef) => JSON.stringify([ref.sessionId, ref.id]);

async function result<T extends Json>(signal: AbortSignal, work: () => T | Promise<T>): Promise<CallResult<T>> {
  try {
    signal.throwIfAborted();
    return { kind: "succeeded", data: await work() };
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The Todo operation was cancelled." };
    if (error instanceof PluginApiError) return { kind: "rejected", error: { code: error.reason ?? error.code, message: error.message } };
    if (error instanceof TextError) return error.outcome();
    if (error instanceof FilesystemError) return error.outcome;
    throw error;
  }
}

/** Shared data is independent of session paths. Attached resources index only the current presentation and notification routes. */
export default defineModule(plugin => {
  const attached = new Map<string, { entries: Map<string, ResourceRef>; latest: number }>();
  const changed = (change: TodoChange) => {
    for (const listId of change.listIds) {
      const list = attached.get(listId);
      if (!list) continue;
      list.latest++;
      for (const ref of list.entries.values()) {
        plugin.object(ref.sessionId, TodoListResource, ref.id).invalidate();
      }
    }
    const notification = change.notification;
    if (!notification) return;
    const list = store.requireList(notification.todo.listId);
    const message = notificationText(list, notification);
    const entrances: { source: ResourceSnapshot; recipients: readonly ResourceSnapshot[] }[] = [];
    for (const ref of attached.get(list.id)?.entries.values() ?? []) {
      const snapshot = plugin.session(ref.sessionId).snapshot();
      const source = snapshot.resources.get(TodoListResource, ref.id);
      if (source?.status === "known") entrances.push({ source: source.resource, recipients: snapshot.resources.linkedTo(ref) });
    }
    for (const { source, recipient } of notificationRoutes(entrances, notification.actor)) {
      plugin.tasks.start(`todo-notification:${nanoid()}`, signal =>
        plugin.session(recipient.ref.sessionId).invoke(SubmitAgentInput, recipient.ref, {
          submissionId: nanoid(16), mode: "follow", parts: [{ kind: "text", text: message }],
          sender: { kind: "event", resource: { ...source.ref }, name: source.title },
        }, { signal }), { object: source.ref, affectsHistory: false });
    }
  };
  const store = new TodoStore(plugin.db(), changed);
  const binding = (object: ObjectReader) => TodoListResource.stateSchema.parse(object.snapshot()?.data).listId;

  return {
    resources: [implementResource(TodoListResource, TodoListView, {
      card: todoListCard, links: { receive: true },
      creation: implementCreation(CreateTodoListResource, {
        create({ listId }) {
          const list = store.requireList(listId);
          return { title: list.title, data: { listId } };
        },
      }),
      attach({ listId }, object, lifetime) {
        let list = attached.get(listId);
        if (!list) { list = { entries: new Map(), latest: 0 }; attached.set(listId, list); }
        const key = keyOf(object.ref);
        list.entries.set(key, object.ref);
        lifetime.defer(() => {
          list.entries.delete(key);
          if (!list.entries.size) attached.delete(listId);
        });
      },
      project: ({ listId }) => ({ listId, list: store.getList(listId), latest: attached.get(listId)?.latest ?? 0 }),
      async inspect({ listId }) {
        const list = store.getList(listId);
        return { listId, available: list !== null, list,
          notifications: ["created", "completed", "reopened"],
          description: "This resource is permanently bound to a shared list outside sessions. Resource links grant tool access; Agents exposed to an attached entry receive list notifications. Entries for the same list share data across active sessions. Content edits, claims, releases, deletion, and retention update views without Agent notifications. Removing an entry leaves the list intact; deleting the list leaves entries unavailable.",
        };
      },
      actions: [implementAction(MutateTodo, {
        async execute(input, object, signal) {
          signal.throwIfAborted();
          const listId = binding(object);
          switch (input.action) {
            case "create": store.create(listId, input, user); break;
            case "write": store.write(listId, input.id, input.content, user); break;
            case "claim": store.claim(listId, input.id, user); break;
            case "release": store.release(listId, input.id, user); break;
            case "complete": store.complete(listId, input.id, input.note, user); break;
            case "reopen": store.reopen(listId, input.id, user); break;
            case "delete": store.delete(listId, input.id); break;
          }
        },
      })],
    })],
    calls: [
      implementCall(BrowseTodoLists, async (_input, { signal }) => { signal.throwIfAborted(); return store.lists(); }),
      implementCall(CreateSharedTodoList, async (input, { signal }) => { signal.throwIfAborted(); return store.createList(input); }),
      implementCall(DeleteSharedTodoList, async (input, { signal }) => { signal.throwIfAborted(); return store.deleteList(input); }),
      implementCall(ReadTodoPage, async (input, { object, signal }) => { signal.throwIfAborted(); return store.page(binding(object), input, user); }),
      implementCall(ReadTodoItem, async ({ id }, { object, signal }) => { signal.throwIfAborted(); return store.get(binding(object), id); }),
    ],
    topLevelTools: [
      defineTopLevelTool({
        id: BrowseTodoLists.id, name: "todo_lists", description: "List shared Todo lists available for connecting Todo List resources across sessions.",
        guidelines: ["Each list ID can be passed to the Todo List resource creation entry. Listing discovers external data; it does not connect a resource or grant that resource's tools."],
        argsSchema: z.strictObject({}).describe("Empty parameter object."), resultSchema: z.array(todoListSchema).describe("Existing shared lists with stable IDs, names, task counts, and completed-item retention settings."),
        effect: "read", execution: "parallel", execute: (_args, { signal }) => result(signal, () => store.lists()), toModel: listsToModel,
      }),
      defineTopLevelTool({
        id: CreateSharedTodoList.id, name: "todo_create_list", description: "Create a shared Todo list outside sessions and return its stable ID for resource connection.",
        guidelines: ["Creation does not create or connect a resource. Completed-item retention is opt-in: null retains all completed tasks. A configured count prunes oldest completions on task creation and completion, without Agent notifications."],
        argsSchema: listCreationSchema, resultSchema: todoListSchema.describe("The created shared list; its id can be used as listId when creating a Todo List resource."),
        effect: "write", execution: "sequential", execute: (input, { signal }) => result(signal, () => store.createList(input)), toModel: listToModel,
      }),
      defineTopLevelTool({
        id: DeleteSharedTodoList.id, name: "todo_delete_list", description: "Delete a shared Todo list and its tasks, optionally transferring unfinished tasks to an existing list.",
        guidelines: ["Transfer preserves pending and in-progress task IDs, state, actors, and content. Completed tasks are deleted with the source list. Without a destination, all tasks are deleted.",
          "Connected resource entries retain their original binding and become unavailable, including in other sessions. Later operations fail with todo_list_not_found. Transfer is not task creation and sends no Agent notifications."],
        argsSchema: listDeletionSchema, resultSchema: DeleteSharedTodoList.output.describe("The deleted list ID and number of unfinished tasks transferred."),
        effect: "write", execution: "sequential", execute: (input, { signal }) => result(signal, () => store.deleteList(input)),
        toModel: ({ deletedListId, transferred }) => `Deleted list ${deletedListId}${transferred ? `; transferred ${transferred} unfinished tasks` : ""}.`,
      }),
    ],
    tools: [
      implementTool(TodoListItems, {
        call: ({ listId }, target, _args, { caller, signal }) => result(signal, () => store.page(listId, target ?? todoPageSchema.parse({}), agent(caller))),
        toModel: pageToModel,
      }),
      implementTool(TodoRead, {
        call: ({ listId }, { id, ...range }, _args, { signal }) => result(signal, () => {
          const { content, ...todo } = store.get(listId, id);
          return { todo, content: readText(content, range.anchored !== false, { offset: range.offset, limit: range.limit ?? 1000, maxBytes: 64 * 1024 }) };
        }),
        toModel: readTodoToModel,
      }),
      implementTool(TodoWrite, {
        call: ({ listId }, { id }, { content }, { caller, signal }) => result(signal, () => {
          const before = store.get(listId, id);
          const data = textChange(before.content, content, before.title);
          if (data.changed) store.write(listId, id, content, agent(caller));
          return data;
        }), toModel: writeToModel,
      }),
      implementTool(TodoEdit, {
        call: ({ listId }, { id }, { edits }, { caller, signal }) => result(signal, () => {
          const before = store.get(listId, id);
          const edited = editText(before.content, edits);
          const data = textChange(before.content, edited.text, before.title, edited.touchedLines);
          if (data.changed) store.write(listId, id, edited.text, agent(caller));
          return data;
        }), toModel: editToModel,
      }),
      implementTool(TodoGrep, {
        call: ({ listId }, target, args, { caller, signal }) => result(signal, () => {
          const self = agent(caller);
          const todos = target?.id ? [store.get(listId, target.id)].filter(todo => {
            if (target.status && !target.status.includes(todo.status)) return false;
            const assignee = target.assignee;
            if (assignee === undefined) return true;
            if (assignee === "unassigned") return todo.assignee === null;
            return todo.assignee !== null && actorKey(todo.assignee) === actorKey(assignee === "self" ? self : assignee);
          }) : store.contents(listId, target ?? {}, self);
          return grepTodos(todos, args, target?.anchored !== false, signal);
        }), toModel: todoGrepToModel,
      }),
      implementTool(TodoCreate, { call: ({ listId }, _target, input, { caller, signal }) => result(signal, () => store.create(listId, input, agent(caller))), toModel: mutationToModel("Created") }),
      implementTool(TodoClaim, { call: ({ listId }, { id }, _args, { caller, signal }) => result(signal, () => store.claim(listId, id, agent(caller))), toModel: mutationToModel("Claimed") }),
      implementTool(TodoRelease, { call: ({ listId }, { id }, _args, { caller, signal }) => result(signal, () => store.release(listId, id, agent(caller))), toModel: mutationToModel("Released") }),
      implementTool(TodoComplete, { call: ({ listId }, { id }, { note }, { caller, signal }) => result(signal, () => store.complete(listId, id, note, agent(caller))), toModel: mutationToModel("Completed") }),
      implementTool(TodoReopen, { call: ({ listId }, { id }, _args, { caller, signal }) => result(signal, () => store.reopen(listId, id, agent(caller))), toModel: mutationToModel("Reopened") }),
      implementTool(TodoDelete, { call: ({ listId }, { id }, _args, { signal }) => result(signal, () => store.delete(listId, id)), toModel: ({ deletedId }) => `Deleted ${deletedId}.` }),
    ],
  };
});

export const todoCreation = defineAgentCreation({
  id: CreateTodoListResource.id, creation: CreateTodoListResource,
  description: "Connect a Todo List resource to an existing shared list. The selected list is fixed for the lifetime of this entry.",
  inputSchema: z.strictObject({ listId: z.string().min(1).describe("Existing shared list ID returned by todo_lists or todo_create_list."), expose_self: z.boolean().optional().describe("Expose yourself to the new resource to receive created, completed, and reopened task notifications. Defaults to false.") }),
  toInput: ({ listId }) => ({ listId }), toOptions: ({ expose_self }) => ({ exposeSelf: expose_self }),
  guidelines: ["todo_lists discovers existing lists; todo_create_list creates shared data independently of resources.",
    "read, write, edit, and grep operate on task Markdown content; list filters summaries. todo_ actions create, claim, release, complete, reopen, and delete tasks. Titles remain fixed after creation.",
    "Resource access and Agent exposure are independent directions. Exposed Agents receive notifications through attached entries in active sessions; the acting Agent is excluded and duplicate exposure paths are delivered once. There is no offline replay. Content edits, claims, releases, transfers, and deletion do not notify Agents."],
});
