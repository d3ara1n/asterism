import { z } from "zod";
import { conversationEventSchema } from "../shared/conversation.ts";

export const capabilitySchema = z.object({
  history_viewing: z.boolean(),
  state_restore: z.boolean(),
});

export const bindingActionSchema = z.enum(["attach", "detach"]);

export const turnStatusSchema = z.enum(["completed", "waiting", "failed", "cancelled", "interrupted"]);

export const historyPositionSchema = z.object({
  branch_id: z.string(),
  event_id: z.string(),
  seq: z.number().int().positive(),
});

const taskCreated = z.object({
  type: z.literal("task_created"),
  payload: z.object({ task_id: z.string(), title: z.string().optional() }),
});

const branchCreated = z.object({
  type: z.literal("branch_created"),
  payload: z.object({
    branch_id: z.string(),
    task_id: z.string(),
    origin_branch_id: z.string().optional(),
    origin_position: historyPositionSchema.optional(),
  }),
});

const agentCreated = z.object({
  type: z.literal("agent_created"),
  payload: z.object({
    agent_id: z.string(),
    parent_agent_id: z.string().optional(),
    title: z.string().optional(),
  }),
});

const resourceCreated = z.object({
  type: z.literal("resource_created"),
  payload: z.object({
    resource_id: z.string(),
    type: z.string(),
    capabilities: capabilitySchema,
    title: z.string().optional(),
    content_ref: z.string().optional(),
  }),
});

const bindingRequested = z.object({
  type: z.literal("binding_requested"),
  payload: z.object({
    agent_id: z.string(),
    resource_id: z.string(),
    action: bindingActionSchema,
    permissions: z.array(z.string()),
  }),
});

const bindingsApplied = z.object({
  type: z.literal("bindings_applied"),
  payload: z.object({
    agent_id: z.string(),
    applied_event_ids: z.array(z.string()),
    binding_version: z.number().int().positive(),
  }),
});

const turnStarted = z.object({
  type: z.literal("turn_started"),
  payload: z.object({
    agent_id: z.string(),
    turn_id: z.string(),
    history_position: historyPositionSchema,
    binding_version: z.number().int().nonnegative(),
    rules_version: z.number().int().nonnegative(),
    tool_catalog_version: z.number().int().nonnegative(),
    input: z.unknown(),
  }),
});

const turnEnded = z.object({
  type: z.literal("turn_ended"),
  payload: z.object({
    turn_id: z.string(),
    status: turnStatusSchema,
  }),
});

const operationStarted = z.object({
  type: z.literal("operation_started"),
  payload: z.object({
    operation_id: z.string(),
    agent_id: z.string(),
    turn_id: z.string(),
    resource_id: z.string(),
    name: z.string(),
    params: z.unknown(),
  }),
});

const operationFinished = z.object({
  type: z.literal("operation_finished"),
  payload: z.object({
    operation_id: z.string(),
    status: z.enum(["succeeded", "partial", "failed", "unknown"]),
    result: z.unknown().optional(),
  }),
});

const subagentResultDelivered = z.object({
  type: z.literal("subagent_result_delivered"),
  payload: z.object({
    parent_agent_id: z.string(),
    child_agent_id: z.string(),
    result_ref: z.unknown(),
  }),
});

const configApplied = z.object({
  type: z.literal("config_applied"),
  payload: z.object({
    rules_version: z.number().int().positive(),
  }),
});

export const eventBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("conversation_event"), payload: conversationEventSchema }),
  z.object({ type: z.literal("execution_failed"), payload: z.object({ agent_id: z.string(), turn_id: z.string(), code: z.string(), message: z.string() }) }),
  taskCreated,
  branchCreated,
  agentCreated,
  resourceCreated,
  bindingRequested,
  bindingsApplied,
  turnStarted,
  turnEnded,
  operationStarted,
  operationFinished,
  subagentResultDelivered,
  configApplied,
]);

export const storedEventSchema = z.intersection(
  z.object({
    event_id: z.string(),
    branch_id: z.string(),
    seq: z.number().int().positive(),
    recorded_at: z.string(),
  }),
  eventBodySchema,
);

export type Capability = z.infer<typeof capabilitySchema>;
export type BindingAction = z.infer<typeof bindingActionSchema>;
export type TurnStatus = z.infer<typeof turnStatusSchema>;
export type HistoryPosition = z.infer<typeof historyPositionSchema>;
export type EventBody = z.infer<typeof eventBodySchema>;
export type StoredEvent = z.infer<typeof storedEventSchema>;
export type EventType = EventBody["type"];
