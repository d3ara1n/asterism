import { z } from "zod";
import { defineAction, defineCreation, defineImplementation } from "@asterism-app/sdk/contracts";
import { builtin, GetProfile, List, Peek, peekResultSchema, Send, sendResultSchema, SetProfile } from "@asterism-app/builtin-api/contracts";

export const defaultChannelId = "default";
export const Mesh = builtin.resource("mesh", z.strictObject({}));
export const MeshState = builtin.data("mesh.state", z.strictObject({
  channelId: z.string().min(1),
  profiles: z.record(z.string(), z.string()),
}));
export const CreateMesh = defineCreation(Mesh, {
  id: builtin.name("mesh.create"), schema: z.strictObject({}).describe("Create a Mesh in the default channel."),
});
export const SelectMeshChannel = defineAction(Mesh, {
  id: builtin.name("mesh.select-channel"), schema: z.strictObject({ channelId: z.string().min(1) }),
});
const channelTitle = z.string().trim().min(1).max(160);
export const CreateMeshChannel = defineAction(Mesh, {
  id: builtin.name("mesh.create-channel"), schema: z.strictObject({ title: channelTitle }),
});
export const RenameMeshChannel = defineAction(Mesh, {
  id: builtin.name("mesh.rename-channel"), schema: z.strictObject({ channelId: z.string().min(1), title: channelTitle }),
});
export const MeshView = builtin.data("mesh.card", z.strictObject({
  channelId: z.string(),
  channels: z.array(z.strictObject({ id: z.string(), title: z.string(), agents: z.number().int().nonnegative() })),
}));
export type MeshCardData = z.infer<typeof MeshView.schema>;

export const meshTargetSchema = z.strictObject({
  title: z.string().min(1).describe("Exact Agent title returned by list or get_profile."),
  id: z.number().int().nonnegative().optional().describe(
    "Channel-local name disambiguator returned by list or get_profile. Omitted means 0, even when another ID is the only remaining Agent with this title. IDs stay fixed while a member remains; gaps are retained until all Agents with this title leave. This is not a permanent identity."),
}).describe("An Agent exposed to this Mesh channel, addressed by title and an optional numeric disambiguator.");
export type MeshTarget = z.infer<typeof meshTargetSchema>;
export const meshProfileSchema = z.strictObject({
  title: z.string(), id: z.number().int().nonnegative(), type: z.string(),
  descriptions: z.array(z.string()).describe("Distinct task descriptions published through this channel's Mesh resources."),
}).describe("Agent title, channel-local name disambiguator, configured type, and task descriptions.");
export type MeshProfile = z.infer<typeof meshProfileSchema>;
export const MeshList = defineImplementation({
  ...builtin.data("mesh.list", z.strictObject({ agents: z.array(meshProfileSchema), truncated: z.boolean() })
    .describe("Distinct Agents exposed to the captured channel. Internal resource identities are not included.")),
  resource: Mesh, tool: List, targetSchema: z.null().describe("List the distinct Agents exposed to this Mesh channel."),
  effect: "read", execution: "parallel",
});
export const MeshGetProfile = defineImplementation({
  ...builtin.data("mesh.get-profile", meshProfileSchema.extend({
    id: z.number().int().nonnegative().nullable().describe("Null when you are not exposed to this channel."),
  }).describe("Agent identity in this channel and its task descriptions; your own description is local to this Mesh.")), resource: Mesh, tool: GetProfile,
  targetSchema: meshTargetSchema.nullable().describe("Null reads your own description on this Mesh. A named target reads its descriptions exposed through the channel."),
  effect: "read", execution: "parallel",
});
export const MeshSetProfile = defineImplementation({
  ...builtin.data("mesh.set-profile", z.strictObject({ description: z.string() }).describe("Your saved task description on this Mesh.")),
  resource: Mesh, tool: SetProfile, targetSchema: z.null().describe("Your own profile on this Mesh; the runtime supplies your identity."),
  effect: "write", execution: "sequential",
});
export const MeshSend = defineImplementation({
  ...builtin.data("mesh.send", sendResultSchema), resource: Mesh, tool: Send, targetSchema: meshTargetSchema,
  effect: "write", execution: "sequential",
});
export const MeshPeek = defineImplementation({
  ...builtin.data("mesh.peek", peekResultSchema), resource: Mesh, tool: Peek, targetSchema: meshTargetSchema,
  effect: "read", execution: "parallel",
});
