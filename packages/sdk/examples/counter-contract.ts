import { z } from "zod";
import { pluginNamespace, defineCreation, defineAction, defineRecord, defineChannel } from "@atelier/sdk/contracts";

export const sample = pluginNamespace("example.counter");
export const Counter = sample.resource("counter", z.strictObject({}));
export const Count = sample.data("count", z.strictObject({ value: z.number().int() }));
export const CounterView = sample.data("card", Count.schema);
export const CountChanged = defineRecord(sample.name("count-changed"), {
  schema: Count.schema,
});
const createInput = z.strictObject({ title: z.string().trim().min(1).default("Counter") });
const actionInput = z.strictObject({ amount: z.number().int() });
export const CreateCounter = defineCreation(Counter, { id: sample.name("create"), schema: createInput });
export const ChangeCount = defineAction(Counter, { id: sample.name("change"), schema: actionInput });
/** 对象级双工通道：前端请求实时推送，后台按对象发送当前值；不进入时间线。 */
export const CounterUpdates = defineChannel<{ type: "subscribe" }, { value: number }>(sample.name("updates"));
