import { z } from "zod";
import { coreChannel } from "./core.ts";
import { contentChunkSize } from "./content.ts";

export const fileSaveChannel = coreChannel("file-save");
export const fileSaveCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("begin"), filename: z.string().min(1) }),
  z.strictObject({ type: z.literal("write"), id: z.string().uuid(), data: z.instanceof(Uint8Array).refine(value => value.length <= contentChunkSize) }),
  z.strictObject({ type: z.literal("finish"), id: z.string().uuid() }),
  z.strictObject({ type: z.literal("abort"), id: z.string().uuid() }),
]);
export const fileSaveReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("opened"), id: z.string().uuid().nullable() }),
  z.strictObject({ kind: z.literal("done") }),
]);
export type FileSaveCommand = z.infer<typeof fileSaveCommandSchema>;
export type FileSaveReply = z.infer<typeof fileSaveReplySchema>;
