import { z } from "zod";
import { defineAction, defineCall, defineCreation, defineImplementation, defineTool, type Json, type ToolInput } from "@asterism-app/sdk/contracts";
import { builtin, List, Read, Write, Edit, Grep, textReadSchema, textReadTargetSchema, textChangeSchema, textRowSchema } from "@asterism-app/builtin-api/contracts";
import { stopReasonSchema } from "../filesystem/search-contract.ts";
import { listCreationSchema, listDeletionSchema, todoCreationSchema, todoFilterSchema, todoListSchema, todoPageSchema, todoPageResultSchema, todoSchema } from "./model.ts";

export const TodoListResource = builtin.resource("todo-list", z.strictObject({ listId: z.string().min(1) }));
export const CreateTodoListResource = defineCreation(TodoListResource, {
  id: builtin.name("todo-list.connect"),
  schema: z.strictObject({ listId: z.string().min(1).describe("Existing shared list ID returned by todo_lists or todo_create_list. The resource binding is permanent.") }),
});
export const TodoListView = builtin.data("todo-list.card", z.strictObject({
  listId: z.string(), list: todoListSchema.nullable(), latest: z.number().int().nonnegative(),
}));
export type TodoListCardData = z.infer<typeof TodoListView.schema>;
export const BrowseTodoLists = defineCall(builtin.name("todo.lists"), { scope: "plugin", input: z.strictObject({}), output: z.array(todoListSchema) });
export const CreateSharedTodoList = defineCall(builtin.name("todo.create-list"), { scope: "plugin", input: listCreationSchema, output: todoListSchema });
export const DeleteSharedTodoList = defineCall(builtin.name("todo.delete-list"), { scope: "plugin", input: listDeletionSchema, output: z.strictObject({ deletedListId: z.string(), transferred: z.number().int().nonnegative() }) });
export const ReadTodoPage = defineCall(builtin.name("todo.page"), { scope: "object", input: todoPageSchema, output: todoPageResultSchema });
export const ReadTodoItem = defineCall(builtin.name("todo.item"), { scope: "object", input: z.strictObject({ id: z.string().min(1) }), output: todoSchema });
export const MutateTodo = defineAction(TodoListResource, { id: builtin.name("todo.mutate"), schema: z.discriminatedUnion("action", [
  todoCreationSchema.extend({ action: z.literal("create") }),
  z.strictObject({ action: z.literal("write"), id: z.string().min(1), content: z.string() }),
  z.strictObject({ action: z.enum(["claim", "release", "reopen", "delete"]), id: z.string().min(1) }),
  z.strictObject({ action: z.literal("complete"), id: z.string().min(1), note: z.string().optional() }),
]) });
const itemTarget = z.strictObject({ id: z.string().min(1).describe("Task ID returned by list, read, grep, or todo_create within this resource's bound list.") }).describe("Select an existing task in this resource's bound shared list.");
export const TodoListItems = defineImplementation({
  ...builtin.data("todo.list", todoPageResultSchema.describe("Task summaries ordered by creation time then ID, with total matching count and nextOffset for another page.")),
  resource: TodoListResource, tool: List, targetSchema: todoPageSchema.nullable().describe("Filter this bound list by status and assignee. Conditions intersect. Null uses all tasks, offset 0, limit 100. nextOffset continues the current view; concurrent changes can shift pages."),
  effect: "read", execution: "parallel",
});
export const TodoRead = defineImplementation({
  ...builtin.data("todo.read", z.strictObject({ todo: todoSchema.omit({ content: true }), content: textReadSchema }).describe("Current task metadata and selected Markdown content lines. Only content lines carry edit anchors; metadata and completion are not editable text.")),
  resource: TodoListResource, tool: Read, targetSchema: itemTarget.extend(textReadTargetSchema.shape).describe("Select a task and its content line range. Anchors apply only to this task's Markdown content; nextOffset continues that content."),
  effect: "read", execution: "parallel",
});
export const TodoWrite = defineImplementation({
  ...builtin.data("todo.write", textChangeSchema), resource: TodoListResource, tool: Write,
  targetSchema: itemTarget.describe("Replace only this existing task's complete Markdown content. Title, status, assignee, and completion remain unchanged, including for completed tasks."),
  effect: "write", execution: "sequential",
});
export const TodoEdit = defineImplementation({
  ...builtin.data("todo.edit", textChangeSchema), resource: TodoListResource, tool: Edit,
  targetSchema: itemTarget.describe("Edit only this existing task's Markdown content using anchors from read, grep, or edit. Other task fields remain unchanged. A deleted or transferred task is not found in this list."),
  effect: "write", execution: "sequential",
});
export const TodoGrep = defineImplementation({
  ...builtin.data("todo.grep", z.strictObject({
    matches: z.array(z.strictObject({ target: itemTarget, title: z.string(), rows: z.array(textRowSchema.extend({ match: z.boolean() })) })),
    stopReason: stopReasonSchema,
  }).describe("Matching content lines grouped by task, with an exact target for read/edit. Each task has independent line numbers and anchors. Titles identify groups but are not searched or editable.")),
  resource: TodoListResource, tool: Grep,
  targetSchema: todoFilterSchema.extend({ id: z.string().min(1).optional(), anchored: z.boolean().optional() }).nullable()
    .describe("Search Markdown content in this list, optionally narrowed by task ID, status, or assignee. Null searches all tasks with anchors. Completion notes and immutable titles are outside the editable content."),
  effect: "read", execution: "parallel",
});
function todoTool<A extends ToolInput, D extends Json, T extends ToolInput>(name: string, description: string, args: z.ZodType<A>, result: z.ZodType<D>, target: z.ZodType<T>, guidelines: string[] = []) {
  return defineImplementation({
    ...builtin.data(name.replace("_", "."), result), resource: TodoListResource,
    tool: defineTool({ id: builtin.name(`tool.${name}`), name, description, guidelines, argsSchema: args }),
    targetSchema: target, effect: "write", execution: "sequential",
  });
}
const empty = z.strictObject({}).describe("No operation parameters; the runtime supplies the acting identity.");
const mutation = z.strictObject({ changed: z.boolean(), todo: todoSchema, retained: z.boolean().describe("False when this completed task was immediately removed by the list's completed-item retention policy.") }).describe("Whether data changed, the resulting task, and whether retention kept it available.");
export const TodoCreate = todoTool("todo_create",
  "Create a task in this resource's bound shared list with an immutable title and Markdown content.",
  todoCreationSchema, mutation, z.null().describe("Create in this resource's permanently bound shared list."),
  ["The runtime records your identity and title. The task starts pending and unassigned. A created notification is sent to exposed Agents through connected resources."]);
export const TodoClaim = todoTool("todo_claim",
  "Claim a pending, unassigned task for yourself and mark it in progress.",
  empty, mutation, itemTarget,
  ["The runtime supplies your identity and title. A task already held by you is unchanged; another holder or status is returned as a failure. Claiming does not start or schedule execution."]);
export const TodoRelease = todoTool("todo_release",
  "Release a task's assignee and return it to pending. Any caller with this list's tools can release it.",
  empty, mutation, itemTarget,
  ["Completed tasks use todo_reopen. Releasing a pending task is unchanged. This operation updates views without sending Agent notifications."]);
export const TodoComplete = todoTool("todo_complete",
  "Mark a task done and replace its completion note, recording you as the completer while preserving its assignee.",
  z.strictObject({ note: z.string().optional().describe("Completion Markdown; omitted replaces the note with null.") })
    .describe("Replacement completion note; the runtime supplies the completer and completion time."),
  mutation, itemTarget,
  ["Any task can be completed, including an unassigned task. On a done task, a different note replaces its completion information and notifies; an identical note is unchanged. Completed-item retention can immediately remove the task; retained reports this."]);
export const TodoReopen = todoTool("todo_reopen",
  "Reopen a completed task as pending, clearing its assignee and current completion information.",
  empty, mutation, itemTarget,
  ["A pending task is unchanged. An in-progress task uses todo_release. Reopening a completed task sends a reopened notification; reassignment and follow-up are workflow choices."]);
export const TodoDelete = todoTool("todo_delete",
  "Delete a task in any status from this bound list.",
  empty, z.strictObject({ deletedId: z.string() }).describe("The deleted task ID."), itemTarget,
  ["Deletion does not notify Agents. Later operations on this task fail with todo_not_found."]);
