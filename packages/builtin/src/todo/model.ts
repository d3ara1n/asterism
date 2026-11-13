import { z } from "zod";
const resourceRefSchema = z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) });

export const todoStatusSchema = z.enum(["pending", "in_progress", "done"]);
export const actorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({ kind: z.literal("agent"), ref: resourceRefSchema, title: z.string() }),
]);
export const actorIdentitySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({ kind: z.literal("agent"), ref: resourceRefSchema, title: z.string().optional().describe("A returned actor title can be passed through; filtering compares only the stable reference.") }),
]);
export const todoTitleSchema = z.string().trim().min(1).max(160).refine(value => !/[\r\n]/u.test(value), "A task title is a single line.");
export const completionSchema = z.strictObject({ note: z.string().nullable(), completedBy: actorSchema, completedAt: z.string() });
export const todoSchema = z.strictObject({
  id: z.string(), listId: z.string(), title: z.string(), content: z.string(), status: todoStatusSchema,
  assignee: actorSchema.nullable(), completion: completionSchema.nullable(),
  createdBy: actorSchema, createdAt: z.string(), updatedBy: actorSchema, updatedAt: z.string(),
});
export const todoSummarySchema = todoSchema.omit({ content: true, completion: true });
export const todoListSchema = z.strictObject({
  id: z.string(), title: z.string(), maxCompletedItems: z.number().int().nonnegative().nullable(), createdAt: z.string(),
  counts: z.strictObject({ pending: z.number().int().nonnegative(), in_progress: z.number().int().nonnegative(), done: z.number().int().nonnegative() }),
});
export const listCreationSchema = z.strictObject({
  title: todoTitleSchema.describe("Name of the shared list."),
  maxCompletedItems: z.number().int().nonnegative().nullable().default(null).describe("Maximum retained completed tasks; null retains all. Cleanup runs on task creation and completion, without a timer."),
}).describe("Shared list name and optional completed-task retention count.");
export const listDeletionSchema = z.strictObject({
  listId: z.string().min(1),
  transferOpenTodosTo: z.string().min(1).optional().describe("Existing destination list for pending and in-progress tasks. Omitted deletes all tasks. Source-list resource bindings remain unchanged and become unavailable."),
}).describe("Shared list to delete and optional destination for unfinished tasks.");
export const todoCreationSchema = z.strictObject({
  title: todoTitleSchema.describe("Immutable task identity in words. A different task is deleted and recreated."),
  content: z.string().default("").describe("Complete Markdown task description, context, constraints, and relevant references."),
}).describe("New task title and complete initial Markdown content.");
export const todoFilterSchema = z.strictObject({
  status: z.array(todoStatusSchema).optional().describe("Allowed statuses; omitted includes all, an empty array matches none."),
  assignee: z.union([z.literal("self"), z.literal("unassigned"), actorIdentitySchema]).optional().describe("Filter by caller, no assignee, or a stable actor identity returned by read/list. Omitted includes all assignees."),
});
export const todoPageSchema = todoFilterSchema.extend({
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().max(500).default(100),
});
export const todoPageResultSchema = z.strictObject({
  todos: z.array(todoSummarySchema), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable(),
});
export type Actor = z.infer<typeof actorSchema>;
export type ActorIdentity = z.infer<typeof actorIdentitySchema>;
export type Todo = z.infer<typeof todoSchema>;
export type TodoSummary = z.infer<typeof todoSummarySchema>;
export type TodoList = z.infer<typeof todoListSchema>;
export type TodoFilter = z.infer<typeof todoFilterSchema>;
export type TodoPage = z.infer<typeof todoPageSchema>;
export type TodoNotification = { kind: "created" | "completed" | "reopened"; todo: Todo; actor: Actor };
export type TodoChange = { listIds: string[]; notification?: TodoNotification };
export function actorKey(actor: ActorIdentity): string {
  return actor.kind === "user" ? "user" : JSON.stringify([actor.ref.sessionId, actor.ref.id, actor.ref.kind]);
}
