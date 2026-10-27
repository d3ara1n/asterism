import { z } from "zod";
import {
  pluginNamespace, defineCreation, defineAction, defineCall,
  defineRecord, defineTool, defineImplementation,
} from "@asterism-app/sdk/contracts";

export const ns = pluginNamespace("example.counter");
export const card = { width: 280, height: 180 };
export const Counter = ns.resource("counter", z.strictObject({}));
export const Value = ns.data("value", z.number());
export const View = ns.data("view", z.number());
export const Changed = defineRecord(ns.name("changed"), { schema: z.number() });
export const Create = defineCreation(Counter, { id: ns.name("create"), schema: z.null() });
export const Increment = defineAction(Counter, { id: ns.name("increment"), schema: z.null() });
export const Settings = ns.config(
  z.strictObject({ step: z.number().int().min(1).max(10) }), { step: 1 },
);
export const ReadStep = defineCall(ns.name("read-step"), {
  scope: "plugin", input: z.null(), output: z.number(),
});
const Read = defineTool({
  id: ns.name("read-counter"), name: "read_counter",
  description: "Read the current value of a counter.", guidelines: [],
  argsSchema: z.null().describe("No arguments."),
});
export const ReadCounter = defineImplementation({
  ...ns.data("read-result", z.number().describe("The current counter value.")),
  resource: Counter, tool: Read,
  targetSchema: z.null().describe("The whole counter."),
  effect: "read", execution: "parallel",
});
