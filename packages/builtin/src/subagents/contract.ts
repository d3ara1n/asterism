import { z } from "zod";
import {
  defineCall, defineChannel, defineCreation, defineImplementation, defineOperationRecord, defineTool,
  modelExpressionSchema, modelUsageSchema, modelBlockSchema, thinkingSchema, type Json, type ModelLiveBlock,
} from "@asterism-app/sdk/contracts";
import { builtin, configurationIdSchema } from "@asterism-app/builtin-api/contracts";

export const SubagentPool = builtin.resource("subagent-pool", z.strictObject({}));
export const subagentParallelism = 4;
export const createPoolSchema = z.strictObject({ title: z.string().trim().min(1).max(160).optional() })
  .describe("Create a shared pool of asynchronous subagents. Resources linked to the pool supply their access.");
export const CreateSubagentPool = defineCreation(SubagentPool, {
  id: builtin.name("subagent-pool.create"),
  schema: createPoolSchema,
});
export const taskIdSchema = z.string().regex(/^sub-[1-9]\d*$/u).describe("A task ID within this pool, such as sub-1.");
export const modelOverrideSchema = z.strictObject({
  model: modelExpressionSchema.describe("Model as provider/model."),
  thinking: thinkingSchema.nullable().describe("Thinking level for this model. Null uses the provider default."),
}).describe("Model and thinking level replacing the Agent role's model selection.");
export const delegateSchema = z.strictObject({
  role: configurationIdSchema.describe("Agent role ID from this pool's role listing."),
  model: modelOverrideSchema.optional().describe("Optional model selection override. Other settings come from the Agent role."),
  task: z.string().min(1).describe("Task instructions and the requested report."),
  context: z.string().optional().describe("Explicit background material for the independent conversation."),
}).describe("Delegate a task using an Agent role and explicit task material.");
export const usageSchema = modelUsageSchema.extend({
  model: z.string().nullable(), requests: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative(),
});
export const finishedSchema = z.strictObject({
  phase: z.literal("finished"),
  outcome: z.enum(["succeeded", "partial", "failed", "cancelled"]),
  code: z.string().nullable(), message: z.string().nullable(),
});
export const statusSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("queued") }),
  z.strictObject({ phase: z.literal("running"), activity: z.string() }),
  finishedSchema,
]);
export const outputSchema = z.strictObject({
  result: z.string().nullable(), usage: usageSchema,
  undelivered: z.array(z.string()).describe("Steering messages queued but not delivered before the task ended."),
});
export const delegationInputSchema = z.strictObject({
  id: taskIdSchema, runId: z.string(), role: z.string(), model: modelOverrideSchema.nullable(),
  task: z.string(), context: z.string().nullable(),
  submittedBy: z.strictObject({ id: z.string(), title: z.string() }),
});
export const completionSchema = z.strictObject({ status: finishedSchema, output: outputSchema, finishedAt: z.string() });
export const Delegation = defineOperationRecord(builtin.name("subagent.delegation"), {
  input: delegationInputSchema, output: completionSchema,
});
export const snapshotSchema = z.strictObject({
  input: delegationInputSchema, status: statusSchema, output: outputSchema,
  createdAt: z.string(), finishedAt: z.string().nullable(),
}).describe("Task identity and input, current status, report, and measured usage.");
export const summarySchema = snapshotSchema.omit({ input: true, output: true }).extend({
  id: taskIdSchema, role: z.string(), task: z.string(), usage: usageSchema,
});
export const PoolView = builtin.data("subagent-pool.card", z.strictObject({ tasks: z.array(summarySchema) }));

const empty = z.strictObject({}).describe("No operation parameters.");
const define = <T extends Json, A extends Json, D extends Json>(
  name: string, description: string, target: z.ZodType<T>, args: z.ZodType<A>, result: z.ZodType<D>, effect: "read" | "write",
) => defineImplementation({
  ...builtin.data(`subagent.${name}-result`, result), resource: SubagentPool,
  tool: defineTool({ id: builtin.name(`tool.subagent_${name}`), name: `subagent_${name}`, description, guidelines: [], argsSchema: args }),
  targetSchema: target, effect, execution: "parallel",
});
export const Delegate = define("delegate", "Submit an independent asynchronous task to this shared pool. Returns its ID; results are retrieved with subagent_check.",
  z.null().describe("Submit to this pool."), delegateSchema, snapshotSchema, "write");
export const Check = define("check", "Read one task's current state or final report. Reading does not consume the result.",
  taskIdSchema, empty, snapshotSchema, "read");
export const Wait = define("wait", "Wait until all selected tasks end. Task failure does not fail the wait. Cancelling the wait leaves tasks running.",
  z.array(taskIdSchema).min(1).describe("Task IDs to wait for, such as [\"sub-1\", \"sub-2\"]."), empty,
  z.strictObject({ tasks: z.array(summarySchema) }).describe("Status and usage for each selected task. Reports are available through subagent_check."), "read");
export const Steer = define("steer", "Append task material to a queued or running task. The task receives it at the next request boundary.",
  taskIdSchema, z.strictObject({ message: z.string().min(1) }).describe("Additional instructions or background."),
  z.strictObject({ id: taskIdSchema, accepted: z.literal(true) }).describe("Confirmation that the material entered this task's input queue."), "write");
export const Cancel = define("cancel", "Cancel a task and wait for its execution to end. Existing output remains available.",
  taskIdSchema, z.strictObject({ reason: z.string().optional() }).describe("Optional reason for cancellation."),
  summarySchema.describe("Final task state after cancellation or an already completed task."), "write");
export const CancelSubagent = defineCall(builtin.name("subagent.cancel"), {
  scope: "object", input: z.strictObject({ id: taskIdSchema }), output: z.null(),
});
export const SteerSubagent = defineCall(builtin.name("subagent.steer"), {
  scope: "object", input: z.strictObject({ id: taskIdSchema, message: z.string().min(1) }), output: z.null(),
});
export type DelegateInput = z.infer<typeof delegateSchema>;
export type ModelOverride = z.infer<typeof modelOverrideSchema>;
export type DelegationInput = z.infer<typeof delegationInputSchema>;
export type TaskSnapshot = z.infer<typeof snapshotSchema>;
export type TaskSummary = z.infer<typeof summarySchema>;
export type TaskOutput = z.infer<typeof outputSchema>;
export type TaskCompletion = z.infer<typeof completionSchema>;
export type FinishedStatus = z.infer<typeof finishedSchema>;
export type ProcessBlock = z.infer<typeof modelBlockSchema>;
export type ProcessFrame = { task: TaskSnapshot | null; blocks: ProcessBlock[]; live: ModelLiveBlock[]; error: string | null };
export type ProcessUpdate = ProcessFrame & { reset: boolean };
export const PoolChannel = defineChannel<{ id: string | null }, ProcessUpdate>(builtin.name("subagent-pool.process"));

export function summary(task: TaskSnapshot): TaskSummary {
  const preview = task.input.task.split("\n")[0]!;
  return { id: task.input.id, role: task.input.role, task: preview.length > 160 ? `${preview.slice(0, 160)}…` : preview, status: task.status,
    usage: task.output.usage, createdAt: task.createdAt, finishedAt: task.finishedAt };
}
export function emptyOutput(): TaskOutput {
  return { result: null, undelivered: [], usage: { model: null, requests: 0, elapsedMs: 0,
    input: null, output: null, total: null, reasoning: null, cacheRead: null, cacheWrite: null } };
}
export function ended(outcome: FinishedStatus["outcome"], code: string | null = null, message: string | null = null): FinishedStatus {
  return { phase: "finished", outcome, code, message };
}
