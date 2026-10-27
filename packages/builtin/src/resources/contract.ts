import { z } from "zod";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

/** Top-level tool result identities are shared by the backend and views, retaining catalog and resource information from the actual call. */
export const AgentListResult = builtin.data("agent.list",
  z.array(z.strictObject({
    id: z.string(), description: z.string(),
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
  z.union([
    z.strictObject({ type: z.string() }),
    z.strictObject({ resource_id: z.string(), type: z.string(), title: z.string().optional() }),
  ]).describe("Resource type during creation; committed resource identity, type, and title on success."));
export const ResourceRemoveResult = builtin.data("resource.remove",
  z.strictObject({ resource_id: z.string() }).describe("Identity of the removed resource."));
export const ResourceRenameResult = builtin.data("resource.rename",
  z.strictObject({ resource_id: z.string(), title: z.string() }).describe("Resource identity and committed title."));
