import { z } from "zod";
import { defineCall, type PluginCalls, type ResourceRef } from "@asterism/sdk/contracts";
import { implementCall } from "@asterism/sdk/runtime";

const Calculate = defineCall("example.calls/calculate", {
  scope: "plugin",
  input: z.object({ value: z.string().transform(Number), increment: z.number().default(1) }),
  output: z.string().transform(Number),
});
const ObjectCall = defineCall("example.calls/object", { scope: "object", input: z.null(), output: z.null() });
const Coerced = defineCall("example.calls/coerced", { scope: "plugin", input: z.coerce.number(), output: z.null() });

/** Calls infer raw and parsed values independently; neither callbacks nor arguments may widen the held contract. */
export async function callTypes(calls: PluginCalls, object: ResourceRef) {
  const result: number = await calls.invoke(Calculate, { value: "41" }, {});
  // @ts-expect-error Callers receive the parsed output rather than the implementation's raw string.
  const raw: string = await calls.invoke(Calculate, { value: "41" }, {});
  // @ts-expect-error The caller supplies raw input; the transformed number is only for the implementation.
  void calls.invoke(Calculate, { value: 41 }, {});
  // @ts-expect-error A plugin-scoped call cannot acquire object scope through its options.
  void calls.invoke(Calculate, { value: "41" }, { object });
  void calls.invoke(ObjectCall, null, { object });
  // @ts-expect-error Object-scoped calls require an explicit resource reference.
  void calls.invoke(ObjectCall, null, {});
  void calls.invoke(Coerced, "41", {});
  // @ts-expect-error Even schemas with unknown input accept only JSON across the call boundary.
  void calls.invoke(Coerced, new Date(), {});
  void result; void raw;
}

implementCall(Calculate, async (input, context) => {
  const value: number = input.value;
  const increment: number = input.increment;
  // @ts-expect-error Implementations receive parsed input with required defaults.
  const raw: string = input.value;
  // @ts-expect-error Plugin-scoped implementations have no object executor or reader.
  context.object.ref;
  void raw;
  return String(value + increment);
});
// @ts-expect-error Implementations return input to the output schema, not its parsed number.
implementCall(Calculate, async () => 42);
