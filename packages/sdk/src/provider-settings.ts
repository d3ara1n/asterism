import { z } from "zod";
import { uiTextSchema } from "./i18n.ts";

const helpUrlSchema = z.url({ protocol: /^https?$/, error: "An HTTP or HTTPS URL is required." });
const base = { key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u), label: uiTextSchema, description: uiTextSchema.optional() };

/**
 * Provider settings use a closed set of kinds that the host renders, validates, and stores.
 * Secret values are stored in the credential vault and never appear in configuration snapshots.
 * Text values are saved trimmed; choices always resolve to a declared option.
 */
export const providerSettingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("secret"), required: z.boolean(), helpUrl: helpUrlSchema.optional() }),
  z.strictObject({ ...base, kind: z.literal("text"), required: z.boolean(), placeholder: uiTextSchema.optional() }),
  z.strictObject({ ...base, kind: z.literal("choice"), default: z.string().min(1),
    options: z.array(z.strictObject({ value: z.string().min(1), label: uiTextSchema, description: uiTextSchema.optional() })).min(1) })
    .refine(setting => new Set(setting.options.map(option => option.value)).size === setting.options.length, "Choice option values are unique.")
    .refine(setting => setting.options.some(option => option.value === setting.default), "The default is one of the options."),
]);
export const providerSettingsSchema = z.array(providerSettingSchema)
  .refine(settings => new Set(settings.map(setting => setting.key)).size === settings.length, "Setting keys are unique.");
export type ProviderSetting = z.infer<typeof providerSettingSchema>;
/** Values supplied to provider factories: choices hold a declared option; required values are present; unset optional values are absent. */
export type ProviderSettingValues = Readonly<Record<string, string | undefined>>;
