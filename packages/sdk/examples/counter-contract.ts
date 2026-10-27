import { z } from "zod";
import { pluginNamespace, defineCreation, defineAction, defineRecord, defineChannel } from "@asterism-app/sdk/contracts";

export const sample = pluginNamespace("example.counter");
export const Counter = sample.resource("counter", z.strictObject({}));
/** Shared by frontend and backend for creation placeholders and actual cards. */
export const counterCard = { width: 300, height: 200 };
export const Count = sample.data("count", z.strictObject({ value: z.number().int() }));
export const CounterView = sample.data("card", Count.schema);
export const CountChanged = defineRecord(sample.name("count-changed"), {
  schema: Count.schema,
});
const createInput = z.strictObject({ title: z.string().trim().min(1).default("Counter") });
const actionInput = z.strictObject({ amount: z.number().int() });
export const CreateCounter = defineCreation(Counter, { id: sample.name("create"), schema: createInput });
export const ChangeCount = defineAction(Counter, { id: sample.name("change"), schema: actionInput });
/** Object-level duplex channel: the frontend requests live updates, and the backend sends current values per object; does not enter the timeline. */
export const CounterUpdates = defineChannel<{ type: "subscribe" }, { value: number }>(sample.name("updates"));
