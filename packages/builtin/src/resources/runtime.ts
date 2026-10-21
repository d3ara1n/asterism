import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { defineModule, defineTopLevelTool, PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import { agentCreations } from "@atelier/builtin-api/runtime";
import { CreationListResult, CreationInspectResult, ResourceCreateResult, ResourceRemoveResult } from "./contract.ts";

/** 已知拒绝不伪装为未知写入；资源初始化异常仍沿用工具执行器的未知结局。 */
async function attempt<T extends Json>(signal: AbortSignal, work: () => T | Promise<T>): Promise<CallResult<T>> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The resource operation was cancelled before completion." };
    if (error instanceof PluginApiError) return { kind: "rejected", error: { code: error.reason ?? error.code, message: error.message } };
    throw error;
  }
}
const id = z.string().min(1).describe("Stable Agent creation entry ID, learned from a skill, documentation, or creation_list.");

export default defineModule(plugin => ({
  topLevelTools: [
    defineTopLevelTool({
      id: CreationListResult.id, name: "creation_list",
      description: "List available Agent resource creation entries and their purposes.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No parameters."),
      resultSchema: CreationListResult.schema,
      effect: "read", execution: "parallel",
      execute(_args, { signal }) { return attempt(signal, () => agentCreations.list(plugin)); },
    }),
    defineTopLevelTool({
      id: CreationInspectResult.id, name: "creation_inspect",
      description: "Read an Agent resource creation entry's input schema and guidelines.",
      guidelines: ["Inspection is optional when the creation input is already known from another source."],
      argsSchema: z.strictObject({ creation_id: id }).describe("The creation entry to inspect."),
      resultSchema: CreationInspectResult.schema,
      effect: "read", execution: "parallel",
      execute(args, { signal }) { return attempt(signal, () => CreationInspectResult.schema.parse(agentCreations.inspect(plugin, args.creation_id))); },
    }),
    defineTopLevelTool({
      id: ResourceCreateResult.id, name: "resource_create",
      description: "Create a resource in this session using a declared Agent creation entry and link it to you.",
      guidelines: [
        "Use an Agent creation entry ID and its input schema. You may learn them from a skill, documentation, or creation_inspect; inspection is not required.",
        "Pass input directly as a JSON value matching the entry's schema. When an object is required, pass the object directly. Do not JSON-encode the value into a string.",
        "The new resource inherits no links or access from you. Its tools become available on your next model request.",
        "Creation and the link to you are committed together. This does not submit work to a newly created Agent.",
      ],
      argsSchema: z.strictObject({ creation_id: id, input: jsonSchema.describe("JSON input matching the selected Agent creation entry.") }).describe("Creation entry and its structured input."),
      resultSchema: ResourceCreateResult.schema,
      effect: "write", execution: "sequential",
      execute(args, context) { return attempt(context.signal, async () => {
        const ref = await agentCreations.create(plugin, args.creation_id, args.input, context);
        return { resource_id: ref.id, type: ref.kind };
      }); },
    }),
    defineTopLevelTool({
      id: ResourceRemoveResult.id, name: "resource_remove",
      description: "Remove a settled resource linked to you from this session and detach all of its links.",
      guidelines: [
        "Use a resource_id from your linked resources. Knowing an unlinked resource ID does not make it accessible.",
        "Busy resources cannot be removed. Cancellation must finish before removal; this tool never cancels or waits for them automatically.",
        "History is preserved. Removing a directory or external-service resource does not delete its underlying files or remote entities.",
      ],
      argsSchema: z.strictObject({ resource_id: z.string().min(1).describe("ID of a resource linked at the start of this request.") }).describe("The linked resource to remove."),
      resultSchema: ResourceRemoveResult.schema,
      effect: "write", execution: "sequential",
      execute(args, { session, signal }) { return attempt(signal, () => { session.remove(args.resource_id); return args; }); },
    }),
  ],
}));
