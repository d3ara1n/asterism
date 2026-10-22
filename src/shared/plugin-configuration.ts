import { z } from "zod";
import { jsonSchema, uiTextSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";

export const pluginConfigurationVersion = 3;
export const pluginConfigurationChannel = coreChannel("plugin-configuration");
export const pluginConfigurationChangedChannel = coreChannel("plugin-configuration-changed");
/** 某插件配置的当前值已变化；接收方重读配置，不携带值。 */
export const pluginConfigurationChangedSchema = z.strictObject({ kind: z.literal("plugin-configuration.changed"), id: z.string().min(1).max(160) });
const id = z.string().min(1).max(160);
export const pluginConfigurationSchema = z.strictObject({
  id, defaults: jsonSchema, value: jsonSchema,
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
    code: z.string().min(1), message: z.string(), display: uiTextSchema.optional(),
  }) }),
]);
export type PluginConfigurationResult = z.infer<typeof pluginConfigurationResultSchema>;
export const pluginConfigurationRequestSchema = z.strictObject({ kind: z.literal("plugin-configuration.request"),
  version: z.literal(pluginConfigurationVersion), id: z.string().uuid(), command: z.unknown() });
export const pluginConfigurationResponseSchema = z.strictObject({ kind: z.literal("plugin-configuration.response"),
  version: z.literal(pluginConfigurationVersion), id: z.string().uuid(), result: pluginConfigurationResultSchema });
export interface PluginConfigurationBridge {
  execute(command: PluginConfigurationCommand): Promise<PluginConfigurationResult>;
  onChanged(listener: (pluginId: string) => void): () => void;
}
