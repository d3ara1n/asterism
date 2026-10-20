import { z } from "zod";
import { defineCall, providerUsageIdSchema, usageItemsSchema, providerUsageErrorSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

/** 内置消费者的展示状态；不约束其他插件的缓存或刷新策略。 */
export const providerUsageStateSchema = z.strictObject({
  providerId: z.string(), revision: z.number().int().nonnegative(), usage: providerUsageIdSchema.nullable(),
  source: z.enum(["query", "headers"]).optional(), model: z.string().optional(),
  state: z.enum(["disabled", "waiting", "loading", "ready", "error"]),
  items: usageItemsSchema, updatedAt: z.number().nonnegative().nullable(), error: providerUsageErrorSchema.nullable(),
});
export type ProviderUsageState = z.infer<typeof providerUsageStateSchema>;
export const ReadUsage = defineCall(builtin.name("usage.read"), {
  scope: "plugin", input: z.strictObject({ providerId: z.string(), refresh: z.boolean() }), output: providerUsageStateSchema,
});
export const UsageChanged = builtin.event("usage.changed", {
  schema: z.strictObject({ providerId: z.string().nullable() }),
  source: "plugin", semantics: { kind: "snapshot", key: ["providerId"] },
});
