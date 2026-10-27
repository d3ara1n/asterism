import { z } from "zod";
import { pluginNamespace, defineRecord, present } from "@asterism/sdk/contracts";
import type { ObjectExecutor } from "@asterism/sdk/runtime";

const ns = pluginNamespace("example.codec");
const current = z.strictObject({ text: z.string() });
/** Read older strings or current objects; write current objects while retaining immutable historical payloads. */
const textSchema = z.codec(z.union([z.string(), current]), current, {
  decode: value => typeof value === "string" ? { text: value } : value,
  encode: value => value,
});
export const Text = ns.data("text", textSchema);
export const TextChanged = defineRecord(ns.name("text-changed"), { schema: textSchema });
export function saveText(object: ObjectExecutor, text: string) {
  const value = { text };
  object.commit(writer => { writer.set(Text, value); writer.append(TextChanged, value); });
  return present(Text, value);
}
