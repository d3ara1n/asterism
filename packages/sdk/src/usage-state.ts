import { z } from "zod";
import { defineCall } from "./calls.ts";
import { defineEvent } from "./events.ts";
import { providerUsageIdSchema, usageItemsSchema, providerUsageErrorSchema } from "./provider-usage.ts";

/** Shared provider usage state; response consumption remains explicit. */
export const providerUsageStateSchema = z.strictObject({
  providerId: z.string(), usage: providerUsageIdSchema.nullable(),
  source: z.enum(["query", "headers"]).optional(), model: z.string().optional(),
  state: z.enum(["disabled", "waiting", "loading", "ready", "error"]),
  items: usageItemsSchema, updatedAt: z.number().nonnegative().nullable(), error: providerUsageErrorSchema.nullable(),
});
export type ProviderUsageState = z.infer<typeof providerUsageStateSchema>;
export const ReadUsage = defineCall("core.usage.read", {
  scope: "plugin", input: z.strictObject({ providerId: z.string(), refresh: z.boolean() }), output: providerUsageStateSchema,
});
export const UsageChanged = defineEvent("core.usage.changed", {
  schema: z.strictObject({ providerId: z.string().nullable() }),
  source: "host", semantics: { kind: "snapshot", key: ["providerId"] },
});
