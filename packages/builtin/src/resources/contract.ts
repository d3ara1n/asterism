import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

/** 顶层工具的结果身份由后台与视图共享，保留实际调用时的目录与资源信息。 */
export const AgentListResult = builtin.data("agent.list",
  z.array(z.strictObject({
    id: z.string(), name: z.string(), description: z.string(),
    examples: z.array(z.string()),
  })).describe("Available agent configuration identities, purposes, and task examples."));
const creationEntrySchema = z.strictObject({
  id: z.string(), resourceKind: z.string(), description: z.string(),
});
export const CreationListResult = builtin.data("creation.list",
  z.array(creationEntrySchema).describe("Available creation entry IDs, resource types, and descriptions."));
export const CreationInspectResult = builtin.data("creation.inspect",
  creationEntrySchema.extend({ guidelines: z.array(z.string()), input: jsonSchema })
    .describe("Creation entry identity, resource type, description, guidelines, and input JSON schema."));
export const ResourceCreateResult = builtin.data("resource.create",
  z.strictObject({ resource_id: z.string(), type: z.string() })
    .describe("Identity and type of the created resource, now linked to you."));
export const ResourceRemoveResult = builtin.data("resource.remove",
  z.strictObject({ resource_id: z.string() }).describe("Identity of the removed resource."));
