import { z } from "zod";
import { uiTextSchema } from "./i18n.ts";
import type { Json } from "./json.ts";
import { bindMessages, type SourceMessage, type UiMessage } from "./i18n.ts";
import { defineData, type DataContract } from "./presentation.ts";
import { defineResource, type ResourceContract } from "./module-contract.ts";
import { defineConfig, type ConfigContract } from "./config.ts";
import { defineEvent, type EventContract, type EventDefinition } from "./events.ts";

const pluginIdPattern = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u;
const shortNamePattern = /^[a-z0-9][a-z0-9._-]*$/u;

/** Static information can be read without executing plugin code; the host resolves icon to an image within the package. */
export const pluginMetadataSchema = z.strictObject({
  name: uiTextSchema.optional(), description: uiTextSchema.optional(),
  version: z.string().optional(), author: z.string().optional(), icon: z.string().optional(),
});
export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;

/**
 * Plugin namespace: declare plugin identity only once here; contract files declare resource types and data contracts using short names,
 * which are expanded here to `<pluginId>/<name>`. Pure contracts shared by frontend and backend.
 */
export interface PluginNamespace {
  readonly id: string;
  messages<T extends Record<string, SourceMessage>>(sourceLocale: string, definitions: T): { readonly [K in keyof T]: UiMessage };
  name(short: string): string;
  resource<S extends Json>(name: string, stateSchema: z.ZodType<S>): ResourceContract<S>;
  data<T extends Json>(name: string, schema: z.ZodType<T>): DataContract<T>;
  event<I, D extends Json>(name: string, definition: EventDefinition<I, D>): EventContract<I, D>;
  /** The plugin's sole user configuration contract. */
  config<T extends Json>(schema: z.ZodType<T>, defaults: NoInfer<T>): ConfigContract<T>;
}
export function pluginNamespace(id: string): PluginNamespace {
  if (!pluginIdPattern.test(id)) throw new Error(`Invalid plugin ID: ${id}`);
  const name = (short: string) => {
    if (!shortNamePattern.test(short)) throw new Error(`Invalid short name in plugin ${id}: ${short}`);
    return `${id}/${short}`;
  };
  return {
    id, name,
    messages: (sourceLocale, definitions) => bindMessages(id, sourceLocale, definitions),
    resource: (short, stateSchema) => defineResource(name(short), stateSchema),
    data: (short, schema) => defineData(name(short), schema),
    event: (short, definition) => defineEvent(name(short), definition),
    config: (schema, defaults) => defineConfig(id, schema, defaults),
  };
}
export function belongsTo(pluginId: string, qualified: string): boolean {
  return qualified.startsWith(`${pluginId}/`) && qualified.length > pluginId.length + 1;
}
/** Extract the source plugin from a namespaced ID; return null when there is no namespace. */
export function pluginOf(qualified: string): string | null {
  const index = qualified.indexOf("/");
  return index > 0 ? qualified.slice(0, index) : null;
}
/** Resource projection for a missing implementation: preserves raw data and the source plugin for fallback UI display. */
export const missingResourceContract = { id: "asterism.host/missing-resource" } as const;
