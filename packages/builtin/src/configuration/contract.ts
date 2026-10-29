import { z } from "zod";
import { defineCall } from "@asterism-app/sdk/contracts";
import { builtin, configurationIdSchema, agentInputSchema, agentSchema, agentOverridesSchema, modelRoleInputSchema, modelRoleSchema, modelRoleOverridesSchema } from "@asterism-app/builtin-api/contracts";

const identity = { id: configurationIdSchema, builtin: z.boolean() };
export const paradigmConfigurationSchema = z.strictObject({
  roles: z.array(z.strictObject({ ...identity, overrides: modelRoleOverridesSchema })),
  agents: z.array(z.strictObject({ ...identity, overrides: agentOverridesSchema })),
}).superRefine((value, context) => {
  for (const kind of ["roles", "agents"] as const) {
    const ids = new Set<string>();
    value[kind].forEach((entry, index) => {
      if (ids.has(entry.id)) context.addIssue({ code: "custom", message: "Duplicate configuration identity.", path: [kind, index, "id"] });
      ids.add(entry.id);
    });
  }
});
export type ParadigmConfiguration = z.infer<typeof paradigmConfigurationSchema>;
export const paradigmSnapshotSchema = z.strictObject({
  roles: z.array(modelRoleSchema), agents: z.array(agentSchema),
  defaults: z.strictObject({ roles: z.record(z.string(), modelRoleInputSchema), agents: z.record(z.string(), agentInputSchema) }),
  overrides: z.strictObject({ roles: z.record(z.string(), modelRoleOverridesSchema), agents: z.record(z.string(), agentOverridesSchema) }),
});
export type ParadigmSnapshot = z.infer<typeof paradigmSnapshotSchema>;
export const configurationOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("role.save"), id: configurationIdSchema.nullable(), value: modelRoleOverridesSchema.extend({ id: configurationIdSchema }) }),
  z.strictObject({ type: z.literal("agent.save"), id: configurationIdSchema.nullable(), value: agentOverridesSchema.safeExtend({ id: configurationIdSchema }) }),
  z.strictObject({ type: z.literal("remove"), kind: z.enum(["role", "agent"]), id: configurationIdSchema }),
]);
export type ConfigurationOperation = z.infer<typeof configurationOperationSchema>;
export const UpdateParadigmConfiguration = defineCall(builtin.name("configuration.update"), {
  scope: "plugin", input: configurationOperationSchema,
  output: z.strictObject({ snapshot: paradigmSnapshotSchema, savedId: configurationIdSchema.nullable() }),
});
