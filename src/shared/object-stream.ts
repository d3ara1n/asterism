import { z } from "zod";
import { coreChannel } from "./core.ts";

export const objectStreamChannel = coreChannel("object-stream");
const id = z.string().min(1).max(160);
const bytes: z.ZodType<Uint8Array> = z.instanceof(Uint8Array);
/** 对象二进制流只用于实时交付，不进入会话事件；两段 IPC 共用同一信封。 */
export const objectStreamSchema = z.strictObject({
  kind: z.literal("object.stream"),
  sessionId: id,
  objectId: id,
  channel: z.string().min(1),
  data: bytes,
});
export type ObjectStream = z.infer<typeof objectStreamSchema>;
export type ObjectStreamPayload = Omit<ObjectStream, "kind">;
