import { z } from "zod";
import { jsonSchema, resourceTitleSchema, type Json } from "@asterism/sdk/contracts";
import { defineModule, defineTopLevelTool, implementCall, PluginApiError, type CallResult } from "@asterism/sdk/runtime";
import { agentCreations } from "@asterism/builtin-api/runtime";
import { AgentConfigurations, ReadAgentCreations } from "@asterism/builtin-api/contracts";
import { AgentListResult, CreationListResult, CreationInspectResult, ResourceCreateResult, ResourceRemoveResult, ResourceRenameResult } from "./contract.ts";

/** Known rejection is not represented as an unknown write; resource initialization exceptions still use the tool executor's unknown outcome. */
async function attempt<T extends Json>(signal: AbortSignal, work: () => T | Promise<T>): Promise<CallResult<T>> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The resource operation was cancelled before completion." };
    if (error instanceof PluginApiError) return { kind: "rejected", error: { code: error.reason ?? error.code, message: error.message } };
    throw error;
  }
}
const id = z.string().min(1).describe("Stable resource creation entry ID. creation_list returns available entries.");

export default defineModule(plugin => ({
  calls: [implementCall(ReadAgentCreations, async () =>
    agentCreations.list(plugin).map(({ id, resourceKind }) => ({ id, resourceKind })))],
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
          .map(({ id, description, examples }) => ({ id, description, examples })));
      },
    }),
    defineTopLevelTool({
      id: CreationListResult.id, name: "creation_list",
      description: "List available resource creation entries and their purposes.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No parameters."),
      resultSchema: CreationListResult.schema,
      effect: "read", execution: "parallel",
      execute(_args, { signal }) { return attempt(signal, () => agentCreations.list(plugin)); },
    }),
    defineTopLevelTool({
      id: CreationInspectResult.id, name: "creation_inspect",
      description: "Read a resource creation entry's input schema and guidelines.",
      guidelines: [],
      argsSchema: z.strictObject({ creation_id: id }).describe("The creation entry to inspect."),
      resultSchema: CreationInspectResult.schema,
      effect: "read", execution: "parallel",
      execute(args, { signal }) { return attempt(signal, () => CreationInspectResult.schema.parse(agentCreations.inspect(plugin, args.creation_id))); },
    }),
    defineTopLevelTool({
      id: ResourceCreateResult.id, name: "resource_create",
      description: "Create a resource in this session using a declared creation entry and link it to you.",
      guidelines: [
        "input is a JSON value matching the creation entry's input schema.",
        "Creation and the link to you are committed together. Your new resource link becomes available on your next model request.",
      ],
      argsSchema: z.strictObject({
        creation_id: id,
        input: jsonSchema.describe("JSON input matching the selected creation entry."),
      }).describe("Creation entry and its structured input."),
      resultSchema: ResourceCreateResult.schema,
      effect: "write", execution: "sequential",
      execute(args, context) { return attempt(context.signal, async () => {
        // The tool execution layer retains progress output on failure or cancellation; successful results explicitly provide the actual title.
        context.publish({ type: agentCreations.inspect(plugin, args.creation_id).resourceKind });
        const resource = await agentCreations.create(plugin, args.creation_id, args.input, context);
        return { resource_id: resource.id, type: resource.kind, title: resource.title };
      }); },
    }),
    defineTopLevelTool({
      id: ResourceRenameResult.id, name: "resource_rename",
      description: "Rename the title of a resource linked to you in this session.",
      guidelines: [
        "The title change is recorded in session history. Resource identity, links, and underlying files or remote entities are preserved.",
        "The new title appears in subsequent request snapshots.",
      ],
      argsSchema: z.strictObject({
        resource_id: z.string().min(1).describe("ID of a resource linked at the start of this request."),
        title: resourceTitleSchema.describe("New resource title, up to 160 characters. Leading and trailing whitespace is trimmed."),
      }).describe("The linked resource and its new title."),
      resultSchema: ResourceRenameResult.schema,
      effect: "write", execution: "sequential",
      execute(args, { session, signal }) {
        return attempt(signal, () => ({ resource_id: args.resource_id, title: session.rename(args.resource_id, args.title) }));
      },
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
