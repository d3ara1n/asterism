import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";

export const pluginConfigurationVersion = 1;
export const pluginConfigurationChannel = coreChannel("plugin-configuration");
const id = z.string().min(1).max(160);
export const pluginConfigurationSchema = z.strictObject({
  id, schema: jsonSchema.nullable(), defaults: jsonSchema, value: jsonSchema,
  status: z.enum(["saved", "defaults", "invalid"]),
});
export type PluginConfiguration = z.infer<typeof pluginConfigurationSchema>;
export const pluginConfigurationCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("read") }),
  z.strictObject({ type: z.literal("save"), id, value: jsonSchema }),
  z.strictObject({ type: z.literal("reset"), id }),
]);
export type PluginConfigurationCommand = z.infer<typeof pluginConfigurationCommandSchema>;
export const pluginConfigurationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), configurations: z.array(pluginConfigurationSchema) }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({
    code: z.enum(["invalid_request", "not_found", "unavailable", "internal"]), message: z.string(),
  }) }),
]);
export type PluginConfigurationResult = z.infer<typeof pluginConfigurationResultSchema>;
export const pluginConfigurationRequestSchema = z.strictObject({ kind: z.literal("plugin-configuration.request"),
  version: z.literal(pluginConfigurationVersion), id: z.string().uuid(), command: pluginConfigurationCommandSchema });
export const pluginConfigurationResponseSchema = z.strictObject({ kind: z.literal("plugin-configuration.response"),
  version: z.literal(pluginConfigurationVersion), id: z.string().uuid(), result: pluginConfigurationResultSchema });
export interface PluginConfigurationBridge {
  execute(command: PluginConfigurationCommand): Promise<PluginConfigurationResult>;
}
