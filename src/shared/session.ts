import { z } from "zod";
import type { LivePatch } from "./live-patch.ts";
import { userInputPartsSchema, submissionIdSchema } from "@asterism/builtin-api/contracts";
import {
  resourceCallSchema, contractReferenceSchema, toolInvocationSchema,
  toolRunningResultSchema, uiTextSchema,
} from "@asterism/sdk/contracts";
import { jsonSchema } from "./model.ts";
import { modelExpressionSchema, thinkingSchema } from "./configuration.ts";
import { pointSchema, workbenchCommands, workbenchSnapshotSchema, type WorkbenchSnapshot } from "./workbench.ts";
import { templateCommands, templateObjectSummarySchema } from "./templates.ts";

const id = z.string().min(1).max(160);
/** Origin: null means software itself; otherwise the host stamps plugin from the write channel and resource is the validated emitting resource. Shared by records and events. */
export const sourceSchema = z.strictObject({ plugin: id, resource: z.strictObject({ sessionId: id, id, kind: id }).nullable() }).nullable();
/**
 * Session tree nodes are generic records: contract identity, host-stamped origin, and opaque payload; the host does not interpret data.
 * Non-null model projects text to recipient (null means all executors); every record enters the path and advances the cursor.
 */
export const sessionNodeSchema = z.strictObject({
  id, sessionId: id, parentId: id.nullable(), createdAt: z.string(), source: sourceSchema,
  contract: id, data: jsonSchema, model: z.string().nullable(), recipient: id.nullable(),
});
export type SessionNode = z.infer<typeof sessionNodeSchema>;
export type NewNode = Omit<SessionNode, "id" | "sessionId" | "parentId" | "createdAt">;

// ---- Session capability interfaces ----
const uuid = z.string().uuid();
export const sessionCommandSchema = z.discriminatedUnion("type", [
  // Home composition entry: establish a session, create the first agent resource, and submit initial input to it.
  z.strictObject({ type: z.literal("start"), submissionId: submissionIdSchema, agent: id, model: modelExpressionSchema.nullable(), thinking: thinkingSchema.nullable(), parts: userInputPartsSchema, contentScopeId: uuid.optional() }),
  z.strictObject({ type: z.literal("read"), sessionId: id }),
  z.strictObject({ type: z.literal("watch"), sessionId: id }),
  z.strictObject({ type: z.literal("unwatch"), sessionId: id }),
  // Exit prompts read current instance state at confirmation time without entering projections or triggering reprojection on changes. Omitted objectIds selects all current-path objects.
  z.strictObject({ type: z.literal("disposal.warnings"), sessionId: id, objectIds: z.array(id).max(1000).optional() }),
  z.strictObject({ type: z.literal("select"), sessionId: id, nodeId: id.nullable() }),
  // Application composition entry: delegate manual naming to the built-in naming module to append domain records.
  z.strictObject({ type: z.literal("rename"), sessionId: id, title: z.string().max(160).refine(value => value.trim().length > 0) }),
  // Archival: clean all session objects before marking archive time; subsequent business reads treat the session as absent.
  z.strictObject({ type: z.literal("archive"), sessionId: id }),
  // Trash restoration clears archive time only and objects reenter the current set.
  z.strictObject({ type: z.literal("restore"), sessionId: id }),
  // Resource card behavior entry: route by object type to resource controllers, whose modules validate command.
  z.strictObject({ type: z.literal("resource.command"), sessionId: id, objectId: id, command: resourceCallSchema, contentScopeId: uuid.optional() }),
  // Add resources to the workbench; the resource module validates input.
  z.strictObject({ type: z.literal("resource.create"), sessionId: id, kind: id, creation: contractReferenceSchema, input: jsonSchema, position: pointSchema,
    /** Request identity, usable for cancellation during preparation. */
    requestId: uuid.optional(), contentScopeId: uuid.optional() }),
  // Cancel creations still preparing; requests already in transactions or absent are unaffected.
  z.strictObject({ type: z.literal("resource.create.cancel"), sessionId: id, requestId: uuid }),
  ...workbenchCommands,
  ...templateCommands,
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
export type SessionMutation = Exclude<SessionCommand, { type: "read" | "watch" | "unwatch" | "disposal.warnings" | `template.${string}` }>;
/** Runtime-only output projection without parent pointers, outside selectable history nodes. */
const liveBase = { id, objectId: id, responseId: id, ordinal: z.number().int().nonnegative() };
export const liveBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...liveBase, kind: z.literal("text"), text: z.string(), endedAt: z.number().nonnegative().nullable() }),
  z.strictObject({ ...liveBase, kind: z.literal("thinking"), text: z.string(), startedAt: z.number().nonnegative(), endedAt: z.number().nonnegative().nullable() }),
  z.strictObject({ ...liveBase, kind: z.literal("toolcall"), name: id, argumentsText: z.string(),
    arguments: jsonSchema, state: z.enum(["input", "ready", "executing"]),
    invocation: toolInvocationSchema.nullable(), result: toolRunningResultSchema.nullable() }),
]);
export type LiveBlock = z.infer<typeof liveBlockSchema>;
/** Uses the same ordered delivery channel as data updates. */
export const sessionProgressSchema = z.strictObject({
  /** Temporary output from active executors, attributed to emitting objects. */
  live: z.array(liveBlockSchema),
  /** Resource holds depending on the current timeline path, not resource business execution state. */
  busyObjectIds: z.array(id),
  /** Creation preparation holds before resource identities exist. */
  timelineBusy: z.boolean(),
});
export type SessionProgress = z.infer<typeof sessionProgressSchema>;
/** Deliver current data when opening sessions, then apply changes directly. */
export const sessionDataSchema = z.strictObject({
  sessionId: id, title: z.string(), cursor: id.nullable(),
  nodes: z.array(sessionNodeSchema),
  workbench: workbenchSnapshotSchema, progress: sessionProgressSchema,
});
export type SessionData = z.infer<typeof sessionDataSchema>;
export const sessionReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("template.source"), objects: z.array(templateObjectSummarySchema) }),
  z.strictObject({ kind: z.literal("template.saved"), templateId: uuid }),
  z.strictObject({ kind: z.literal("template.deleted") }),
  z.strictObject({ kind: z.literal("view"), data: sessionDataSchema }),
  z.strictObject({ kind: z.literal("accepted"), sessionId: id }),
  z.strictObject({ kind: z.literal("warnings"), warnings: z.array(z.strictObject({ objectId: id, title: z.string(), warning: uiTextSchema })) }),
]);
export type SessionReply = z.infer<typeof sessionReplySchema>;
const errorCode = z.string().min(1);
export const sessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), reply: sessionReplySchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: errorCode, message: z.string(), display: uiTextSchema.optional() }) }),
]);
export type SessionResult = z.infer<typeof sessionResultSchema>;
/** Session changes pushed in backend order; runtime is trusted and receivers do not revalidate. */
export type SessionChanged =
  | { kind: "session.opened"; sessionId: string; data: SessionData }
  | { kind: "session.changed"; sessionId: string; nodes: SessionNode[]; cursor: string | null; title: string;
      objects: WorkbenchSnapshot["objects"]; workbench?: WorkbenchSnapshot; layout?: Pick<WorkbenchSnapshot, "views" | "viewport"> }
  /** live is incremental relative to the last delivery; null means streaming text is unchanged. */
  | { kind: "session.progress"; sessionId: string; busyObjectIds: string[]; timelineBusy: boolean; live: LivePatch | null };
export interface SessionBridge {
  execute(command: SessionCommand): Promise<SessionResult>;
  onChanged(listener: (event: SessionChanged) => void): () => void;
}
