import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { defineModule, defineTopLevelTool, PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import { builtin } from "@atelier/builtin-api/contracts";
import { agentCreations } from "@atelier/builtin-api/runtime";

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
      id: builtin.name("creation.list"), name: "creation_list",
      description: "List available Agent resource creation entries and their purposes.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No parameters."),
      resultSchema: jsonSchema.describe("Available creation entry IDs, resource types, and descriptions."),
      effect: "read", execution: "parallel",
      execute(_args, { signal }) { return attempt(signal, () => agentCreations.list(plugin)); },
    }),
    defineTopLevelTool({
      id: builtin.name("creation.inspect"), name: "creation_inspect",
      description: "Read an Agent resource creation entry's input schema and guidelines.",
      guidelines: ["Inspection is optional when the creation input is already known from another source."],
      argsSchema: z.strictObject({ creation_id: id }).describe("The creation entry to inspect."),
      resultSchema: jsonSchema.describe("Creation entry identity, resource type, description, guidelines, and input JSON schema."),
      effect: "read", execution: "parallel",
      execute(args, { signal }) { return attempt(signal, () => jsonSchema.parse(agentCreations.inspect(plugin, args.creation_id))); },
    }),
    defineTopLevelTool({
      id: builtin.name("resource.create"), name: "resource_create",
      description: "Create a resource in this session using a declared Agent creation entry and link it to you.",
      guidelines: [
        "Use an Agent creation entry ID and its input schema. You may learn them from a skill, documentation, or creation_inspect; inspection is not required.",
        "The new resource inherits no links or access from you. Its tools become available on your next model request.",
        "Creation and the link to you are committed together. This does not submit work to a newly created Agent.",
      ],
      argsSchema: z.strictObject({ creation_id: id, input: jsonSchema.describe("JSON input matching the selected Agent creation entry.") }).describe("Creation entry and its structured input."),
      resultSchema: z.strictObject({ resource_id: z.string(), type: z.string() }).describe("Identity and type of the created resource, now linked to you."),
      effect: "write", execution: "sequential",
      execute(args, context) { return attempt(context.signal, async () => {
        const ref = await agentCreations.create(plugin, args.creation_id, args.input, context);
        return { resource_id: ref.id, type: ref.kind };
      }); },
    }),
    defineTopLevelTool({
      id: builtin.name("resource.remove"), name: "resource_remove",
      description: "Remove a settled resource linked to you from this session and detach all of its links.",
      guidelines: [
        "Use a resource_id from your linked resources. Knowing an unlinked resource ID does not make it accessible.",
        "Busy resources cannot be removed. Cancellation must finish before removal; this tool never cancels or waits for them automatically.",
        "History is preserved. Removing a directory or external-service resource does not delete its underlying files or remote entities.",
      ],
      argsSchema: z.strictObject({ resource_id: z.string().min(1).describe("ID of a resource linked at the start of this request.") }).describe("The linked resource to remove."),
      resultSchema: z.strictObject({ resource_id: z.string() }).describe("Identity of the removed resource."),
      effect: "write", execution: "sequential",
      execute(args, { session, signal }) { return attempt(signal, () => { session.remove(args.resource_id); return args; }); },
    }),
  ],
}));
