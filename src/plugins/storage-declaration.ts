import { z } from "zod";

const fileStorage = { path: z.string(), version: z.number().int().positive() };
/** The function-free portion of a plugin storage declaration consumed by the business runtime. */
export const currentPluginStorageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("json"), ...fileStorage }),
  z.object({ kind: z.literal("sqlite"), ...fileStorage }),
  z.object({ kind: z.literal("records"), id: z.string(), version: fileStorage.version, contracts: z.array(z.string()).readonly() }),
]);
export type CurrentPluginStorage = z.infer<typeof currentPluginStorageSchema>;
export type CurrentRecordStorage = Extract<CurrentPluginStorage, { kind: "records" }>;
