import { z } from "zod";
export { isTestFile, assertRuntimeModules } from "./inputs.js";

/** The builder owns this package-relative directory and replaces it as a whole after a successful build. */
export const artifactDirectory = "dist";
/** Loading metadata inside the artifact directory; executable and stylesheet paths are relative to that directory. */
export const artifactFile = "artifact.json";

/** Portable paths are resolved relative to the artifact directory, never the author checkout. */
const relativePath = z.string().min(1).refine(value =>
  !value.includes("\\") && !value.includes("\0") && !value.includes(":") &&
  !value.startsWith("/") && value.split("/").every(part => part !== "" && part !== "." && part !== ".."),
"Expected a portable relative path without traversal");
/** Public bindings use exact bare package requests, never URLs, filesystem paths, or traversal. */
export const moduleSpecifierSchema = z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/[^/\\:\0]+)*$/u)
  .refine(value => !value.split("/").some(part => part === "." || part === ".."), "Expected an exact bare package specifier");
const publicEntries = z.record(moduleSpecifierSchema, relativePath);

/**
 * Realm-specific executable graph of one plugin.
 * public: owned public specifiers and their entry files.
 * imports: specifiers of peer-dependency packages that the emitted files import; the host binds each one to a
 * host module or to another plugin's public entry. Other bare backend imports resolve through Node from the package.
 */
export const artifactSchema = z.object({
  format: z.literal(2),
  id: z.string().min(1),
  runtime: relativePath.optional(),
  storage: relativePath.optional(),
  renderer: relativePath.optional(),
  public: z.object({ runtime: publicEntries, renderer: publicEntries }).strict(),
  imports: z.object({ runtime: z.array(moduleSpecifierSchema), renderer: z.array(moduleSpecifierSchema) }).strict(),
  stylesheets: z.array(relativePath),
}).strict();

export type PluginArtifact = z.infer<typeof artifactSchema>;

/**
 * Module specifiers whose instances the application supplies to plugins, per realm. Plugins declare their packages
 * as peer dependencies; the builder rejects a private copy because it would split React context, Zod classes, or
 * SDK registrations. Every public subpath of the shared UI package is also a renderer host module.
 */
export const hostModules = {
  runtime: ["zod", "@asterism-app/sdk/contracts", "@asterism-app/sdk/runtime"],
  renderer: [
    "react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-intl", "zod",
    "@asterism-app/sdk/contracts", "@asterism-app/sdk/renderer", "sonner", "motion/react",
  ],
} as const satisfies Record<"runtime" | "renderer", readonly string[]>;
export const sharedUiPackage = "@asterism-app/ui";
export function isHostModule(realm: keyof typeof hostModules, specifier: string): boolean {
  return (hostModules[realm] as readonly string[]).includes(specifier) || (realm === "renderer" && specifier.startsWith(`${sharedUiPackage}/`));
}
/** Package names owned by the host in any realm; their other subpaths are not supplied and plugins cannot provide them. */
export const hostPackageNames: ReadonlySet<string> = new Set([...hostModules.runtime, ...hostModules.renderer, sharedUiPackage]
  .map(specifier => /^(?:@[^/]+\/)?[^/]+/u.exec(specifier)![0]));
