import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";

const id = z.string().uuid();
const ref = z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) });
export const callControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("invoke"), id, contract: z.string().min(1), object: ref.optional(), input: jsonSchema }),
  z.strictObject({ type: z.literal("cancel"), id }),
  z.strictObject({ type: z.literal("reset") }),
]);
export const callFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("result"), id, data: jsonSchema }),
  z.strictObject({ type: z.literal("error"), id, code: z.string(), message: z.string() }),
]);
export type CallControl = z.infer<typeof callControlSchema>;
export type CallFrame = z.infer<typeof callFrameSchema>;
