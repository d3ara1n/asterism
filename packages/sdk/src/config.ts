import type { z } from "zod";
import type { Json } from "./json.ts";
import { encodeJson } from "./data-encoding.ts";

/**
 * Plugin configuration contract: settings agreed between users and plugins, with one configuration per plugin shared by frontend and backend.
 * Identity is the plugin ID; the host handles storage, validation, and change notifications, while the plugin provides the page. Preferences such as the last selection are not configuration.
 */
export interface ConfigContract<T extends Json = Json> {
  readonly plugin: string;
  /** Decodes stored and transported configuration; updates and defaults use T. */
  readonly schema: z.ZodType<T>;
  readonly defaults: T;
}
export function defineConfig<T extends Json>(plugin: string, schema: z.ZodType<T>, defaults: NoInfer<T>): ConfigContract<T> {
  const parsed = schema.safeParse(encodeJson(schema, structuredClone(defaults), `${plugin}.configuration defaults`));
  if (!parsed.success) throw new Error(`Configuration defaults of ${plugin} do not match the schema.`);
  return Object.freeze({ plugin, schema, defaults: structuredClone(parsed.data) });
}
/** Decode saved values according to the contract; fall back to defaults when invalid or missing, leaving status display to the caller. */
export function readConfig<T extends Json>(contract: ConfigContract<T>, raw: unknown): { value: T; status: "saved" | "defaults" | "invalid" } {
  if (raw === undefined) return { value: structuredClone(contract.defaults), status: "defaults" };
  const parsed = contract.schema.safeParse(raw);
  return parsed.success ? { value: parsed.data, status: "saved" } : { value: structuredClone(contract.defaults), status: "invalid" };
}
