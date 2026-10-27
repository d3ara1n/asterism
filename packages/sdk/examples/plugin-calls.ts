import { z } from "zod";
import { defineCall, pluginNamespace } from "@asterism-app/sdk/contracts";
import { defineModule, defineTopLevelTool, implementCall } from "@asterism-app/sdk/runtime";

const ns = pluginNamespace("example.interaction");
export const ReadState = defineCall(ns.name("read"), { scope: "object", input: z.null(), output: z.string() });
export const module = defineModule(() => {
  // Share business state within the process; the frontend reads through typed calls without importing backend instances.
  const values = new Map<string, string>();
  return {
    calls: [implementCall(ReadState, async (_input, { object }) => values.get(object.ref.id) ?? "")],
    topLevelTools: [defineTopLevelTool({
      id: ns.name("remember"), name: "remember", description: "Remember a short note for this agent.", guidelines: [],
      argsSchema: z.strictObject({ text: z.string() }).describe("The note to remember."),
      resultSchema: z.string().describe("The saved note."), effect: "write", execution: "sequential",
      async execute({ text }, { object }) {
        values.set(object.ref.id, text);
        return { kind: "succeeded", data: text };
      },
    })],
  };
});
