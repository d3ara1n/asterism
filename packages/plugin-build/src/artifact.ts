import { z } from "zod";
export { isTestFile, assertRuntimeModules } from "./inputs.js";

/** Portable paths are resolved relative to the descriptor's directory, never the author checkout. */
const relativePath = z.string().min(1).refine(value =>
  !value.includes("\\") && !value.includes("\0") && !value.includes(":") &&
  !value.startsWith("/") && value.split("/").every(part => part !== "" && part !== "." && part !== ".."),
"Expected a portable relative path without traversal");
/** Public bindings use exact bare package requests, never URLs, filesystem paths, or traversal. */
export const moduleSpecifierSchema = z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/[^/\\:\0]+)*$/u)
  .refine(value => !value.split("/").some(part => part === "." || part === ".."), "Expected an exact bare package specifier");
const publicEntries = z.record(moduleSpecifierSchema, relativePath);

/** The package manifest points here; publication replaces this small file after a successful build. */
export const pointerSchema = z.object({
  format: z.literal(1),
  build: relativePath,
}).strict();

/** Immutable, realm-specific executable graph. Paths are relative to this artifact's build directory. */
export const artifactSchema = z.object({
  format: z.literal(1),
  id: z.string().min(1),
  buildId: z.string().min(1),
  runtime: relativePath.optional(),
  storage: relativePath.optional(),
  renderer: relativePath.optional(),
  public: z.object({ runtime: publicEntries, renderer: publicEntries }).strict(),
  imports: z.object({ runtime: z.array(moduleSpecifierSchema), renderer: z.array(moduleSpecifierSchema) }).strict(),
  runtimeExternals: z.array(moduleSpecifierSchema),
  stylesheets: z.array(relativePath),
}).strict();

export type ArtifactPointer = z.infer<typeof pointerSchema>;
export type PluginArtifact = z.infer<typeof artifactSchema>;
