import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";

export const pluginCallsChannel = coreChannel("plugin-calls");
export const pluginCallsVersion = 2;
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
export const callRuntimeControlSchema = z.strictObject({ kind: z.literal("plugin-calls.control"), version: z.literal(pluginCallsVersion), control: callControlSchema });
export const callRuntimeFrameSchema = z.strictObject({ kind: z.literal("plugin-calls.frame"), version: z.literal(pluginCallsVersion), frame: callFrameSchema });
export interface CallBridge {
  send(control: CallControl): void;
  onFrame(listener: (frame: CallFrame) => void): () => void;
}
