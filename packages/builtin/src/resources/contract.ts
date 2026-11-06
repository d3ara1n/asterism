import { z } from "zod";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

/** Top-level tool result identities are shared by the backend and views, retaining catalog and resource information from the actual call. */
export const AgentListResult = builtin.data("agent.list",
  z.array(z.strictObject({
    id: z.string(), description: z.string(),
    examples: z.array(z.string()),
    delegates: z.array(z.string()).nullable(),
  })).describe("Available agent configurations, purposes, task examples, and delegation allowlists. delegates is null for unrestricted delegation, an empty list for none, or a list of target role IDs."));
const creationEntrySchema = z.strictObject({
  id: z.string(), resourceKind: z.string(), description: z.string(),
  notice: z.string().optional().describe("Tool-call restriction on the resulting resource; creation remains available."),
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
export const ResourceExposeResult = builtin.data("resource.expose",
  z.strictObject({ resource_id: z.string(), exposed: z.boolean() }).describe("Recipient resource identity and the caller's committed exposure state."));
