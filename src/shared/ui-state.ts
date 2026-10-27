import { z } from "zod";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { coreChannel } from "./core.ts";

/**
 * UI state: incidental persisted state outside settings, such as window dimensions, sidebar widths, and "do not show again" flags.
 * Register each key's schema and default here; validate on read and fall back only for corrupt entries. An unversioned cache without migration or recovery points, reset on file corruption.
 * Task viewports and card positions belong to task view events, not here; user-visible editable preferences belong to settings instead.
 */
/** Preference keys allow only two host-defined prefixes; renderers cannot write other UI state. */
export const preferenceKeySchema = z.string().min(1).max(512).regex(/^(?:creation-route|plugin)\/[\x21-\x7e]+$/u);
export const preferencesGetChannel = coreChannel("preferences:get");
export const preferencesSetChannel = coreChannel("preferences:set");
export const preferenceWriteSchema = z.strictObject({ key: preferenceKeySchema, value: jsonSchema.nullable() });

export const uiStateSchemas = {
  /** Normal main-window bounds, position, and maximized flag, used only by main processes. */
  window: z.object({
    x: z.number().int(), y: z.number().int(),
    width: z.number().int().positive(), height: z.number().int().positive(),
    maximized: z.boolean(),
  }).nullable(),
  /**
   * Controlled preference container: host route memory (`creation-route/...`) and plugin-isolated preferences (`plugin/<pluginId>/...`).
   * Hosts generate keys with JSON values; readers validate individual key semantics using their own schemas, falling back and optionally cleaning invalid values.
   */
  preferences: z.record(preferenceKeySchema, jsonSchema),
} satisfies Record<string, z.ZodType>;

export type UiStateKey = keyof typeof uiStateSchemas;
export type UiState = { [K in UiStateKey]: z.infer<(typeof uiStateSchemas)[K]> };

export const uiStateDefaults: UiState = {
  window: null,
  preferences: {},
};

export function parseUiState<K extends UiStateKey>(key: K, raw: unknown): UiState[K] {
  const result = uiStateSchemas[key].safeParse(raw);
  return (result.success ? result.data : uiStateDefaults[key]) as UiState[K];
}
