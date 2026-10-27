import { z } from "zod";
import { contentRefSchema } from "@asterism/sdk/contracts";

/** Per-chunk transfer limit; chunk acknowledgments provide backpressure. */
export const contentChunkSize = 1024 * 1024;
/** Per-read limit; larger content uses open or range reads. */
export const contentReadLimit = 16 * 1024 * 1024;
const id = z.string().uuid();
const identity = z.string().min(1).max(160);
export const contentTargetSchema = z.strictObject({ contractId: identity, resourceKind: identity, sessionId: identity.optional(), objectId: identity.optional() });
const source = z.union([
  z.strictObject({ scopeId: id }),
  z.strictObject({ sessionId: identity, objectId: identity }),
]);
export const contentCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("input.open"), target: contentTargetSchema }),
  z.strictObject({ type: z.literal("input.close"), scopeId: id }),
  z.strictObject({ type: z.literal("upload.begin"), scopeId: id }),
  z.strictObject({ type: z.literal("upload.write"), scopeId: id, uploadId: id, offset: z.number().int().nonnegative(), data: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= contentChunkSize) }),
  z.strictObject({ type: z.literal("upload.seal"), scopeId: id, uploadId: id }),
  z.strictObject({ type: z.literal("upload.abort"), scopeId: id, uploadId: id }),
  z.strictObject({ type: z.literal("read.open"), source, ref: contentRefSchema,
    range: z.strictObject({ offset: z.number().int().nonnegative().optional(), length: z.number().int().nonnegative().optional() }).optional() }),
  z.strictObject({ type: z.literal("read.next"), readerId: id }),
  z.strictObject({ type: z.literal("read.close"), readerId: id }),
  z.strictObject({ type: z.literal("reset") }),
]);
export type ContentCommand = z.infer<typeof contentCommandSchema>;
export const contentReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("input"), scopeId: id }),
  z.strictObject({ kind: z.literal("upload"), uploadId: id }),
  z.strictObject({ kind: z.literal("content"), ref: contentRefSchema }),
  z.strictObject({ kind: z.literal("reader"), readerId: id }),
  z.strictObject({ kind: z.literal("bytes"), data: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= contentChunkSize), done: z.boolean() }),
  z.strictObject({ kind: z.literal("done") }),
]);
export type ContentReply = z.infer<typeof contentReplySchema>;
export const contentResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), reply: contentReplySchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: z.string(), message: z.string() }) }),
]);
export type ContentResult = z.infer<typeof contentResultSchema>;
export interface ContentBridge { execute(command: ContentCommand): Promise<ContentResult> }
