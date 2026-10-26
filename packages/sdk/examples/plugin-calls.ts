import { z } from "zod";
import { defineCall, pluginNamespace } from "@asterism/sdk/contracts";
import { defineModule, defineTopLevelTool, implementCall } from "@asterism/sdk/runtime";

const ns = pluginNamespace("example.interaction");
export const ReadState = defineCall(ns.name("read"), { scope: "object", input: z.null(), output: z.string() });
export const module = defineModule(() => {
  // 进程内共享业务状态；前端通过具型调用读取，不导入后台实例。
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
