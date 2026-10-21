import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { defineModule, defineTopLevelTool, PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import { agentCreations } from "@atelier/builtin-api/runtime";
import { AgentConfigurations } from "@atelier/builtin-api/contracts";
import { AgentListResult, CreationListResult, CreationInspectResult, ResourceCreateResult, ResourceRemoveResult } from "./contract.ts";

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
      id: AgentListResult.id, name: "agent_list",
      description: "List available agent configurations and their purposes and task examples.",
      guidelines: [],
      argsSchema: z.strictObject({}).describe("Empty parameter object."),
      resultSchema: AgentListResult.schema,
      effect: "read", execution: "parallel",
      execute(_args, { signal }) {
        return attempt(signal, () => (plugin.catalogs.get(AgentConfigurations) ?? [])
          .filter(agent => agent.enabled)
          .map(({ id, name, description, examples }) => ({ id, name, description, examples })));
      },
    }),
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
      guidelines: [],
      argsSchema: z.strictObject({ creation_id: id }).describe("The creation entry to inspect."),
      resultSchema: CreationInspectResult.schema,
      effect: "read", execution: "parallel",
      execute(args, { signal }) { return attempt(signal, () => CreationInspectResult.schema.parse(agentCreations.inspect(plugin, args.creation_id))); },
    }),
    defineTopLevelTool({
      id: ResourceCreateResult.id, name: "resource_create",
      description: "Create a resource in this session using a declared Agent creation entry and link it to you.",
      guidelines: [
        "input is a JSON value matching the creation entry's input schema.",
        "resources contains IDs from your current request's linked resources. These become initial links received by the new resource.",
        "Creation and all initial links are committed together. Your new resource link becomes available on your next model request.",
      ],
      argsSchema: z.strictObject({
        creation_id: id,
        input: jsonSchema.describe("JSON input matching the selected Agent creation entry."),
        resources: z.array(z.string().min(1)).optional().describe("Resource IDs to link to the new resource. Each ID belongs to your current request's linked resources; the new resource type supports receiving links. Defaults to an empty list."),
      }).describe("Creation entry, structured input, and initial resource links."),
      resultSchema: ResourceCreateResult.schema,
      effect: "write", execution: "sequential",
      execute(args, context) { return attempt(context.signal, async () => {
        const ref = await agentCreations.create(plugin, args.creation_id, args.input, context, { resources: args.resources });
        return { resource_id: ref.id, type: ref.kind };
      }); },
    }),
    defineTopLevelTool({
      id: ResourceRemoveResult.id, name: "resource_remove",
      description: "Remove a settled resource linked to you from this session and detach all of its links.",
      guidelines: [
        "Removal requires a resource linked in the current request and settled at submission time.",
        "History and underlying files or remote entities are preserved.",
      ],
      argsSchema: z.strictObject({ resource_id: z.string().min(1).describe("ID of a resource linked at the start of this request.") }).describe("The linked resource to remove."),
      resultSchema: ResourceRemoveResult.schema,
      effect: "write", execution: "sequential",
      execute(args, { session, signal }) { return attempt(signal, () => { session.remove(args.resource_id); return args; }); },
    }),
  ],
}));
