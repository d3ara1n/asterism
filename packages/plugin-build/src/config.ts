import { z } from "zod";
import { moduleSpecifierSchema } from "./artifact.js";

const source = z.string().min(1).refine(value => !value.startsWith("/") && !/^[A-Za-z]:/u.test(value), "Expected a package-relative source path");
const asset = source.refine(value => !value.replaceAll("\\", "/").split("/").includes(".."), "Expected an asset path inside the package");
const request = moduleSpecifierSchema;
export const buildConfigSchema = z.object({
  runtime: source.optional(), storage: source.optional(), renderer: source.optional(),
  public: z.object({ runtime: z.record(request, source).optional(), renderer: z.record(request, source).optional() }).strict().optional(),
  publicDependencies: z.array(request).optional(), runtimeExternals: z.array(request).optional(), assets: z.array(asset).optional(),
}).strict();
export const manifestSchema = z.object({ asterism: z.object({
  id: z.string().min(1), artifact: z.literal("dist/plugin.json"), build: buildConfigSchema,
}).passthrough() }).passthrough();
/** Author inputs read from package.json.asterism.build. Source paths are package-relative;
 * public maps declare provider entries, publicDependencies classify consumer package imports,
 * and runtimeExternals preserve installed backend packages rather than bundling them.
 * Copied assets retain their package-relative layout in the completed build directory.
 */
export type BuildConfig = z.infer<typeof buildConfigSchema>;
export type Realm = "runtime" | "renderer";

/** This catalog mirrors the host's stable module boundaries, not arbitrary package dependencies. */
const rendererHost = new Set([
  "react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-intl", "zod",
  "@asterism-app/sdk/contracts", "@asterism-app/sdk/renderer", "sonner", "motion/react",
]);
const runtimeHost = new Set(["@asterism-app/sdk/contracts", "@asterism-app/sdk/runtime", "zod"]);
const hostPackages = new Set([...rendererHost, ...runtimeHost, "@asterism-app/ui"].map(request => /^(?:@[^/]+\/)?[^/]+/u.exec(request)![0]));
export const isHostPackage = (request: string): boolean => hostPackages.has(/^(?:@[^/]+\/)?[^/]+/u.exec(request)![0]);
export const isHostImport = (realm: Realm, request: string): boolean => realm === "runtime"
  ? runtimeHost.has(request) : rendererHost.has(request) || request.startsWith("@asterism-app/ui/");
export const matchesPackage = (request: string, names: readonly string[] = []): boolean =>
  names.some(name => request === name || request.startsWith(`${name}/`));
export const isSharedImport = (realm: Realm, request: string, config: BuildConfig): boolean =>
  isHostImport(realm, request) || matchesPackage(request, config.publicDependencies);

/** Static external matchers for Rolldown's CommonJS-to-ESM bridge. Owned entries stay in the graph. */
export function rendererExternals(config: BuildConfig): (string | RegExp)[] {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const owned = Object.keys(config.public?.renderer ?? {}).map(escape);
  const excludeOwned = owned.length ? `(?!(?:${owned.join("|")})$)` : "";
  return [...rendererHost, /^@asterism-app\/ui\//u,
    ...(config.publicDependencies ?? []).map(name => new RegExp(`^${excludeOwned}${escape(name)}(?:$|/)`, "u"))];
}
