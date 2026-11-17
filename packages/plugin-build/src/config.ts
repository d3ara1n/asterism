import { z } from "zod";
import { moduleSpecifierSchema } from "./artifact.js";

const source = z.string().min(1).refine(value => !value.startsWith("/") && !/^[A-Za-z]:/u.test(value), "Expected a package-relative source path");
const specifiers = z.array(moduleSpecifierSchema);
export const buildConfigSchema = z.object({
  runtime: source.optional(), storage: source.optional(), renderer: source.optional(),
  public: z.object({ runtime: specifiers.optional(), renderer: specifiers.optional() }).strict().optional(),
}).strict();
const dependencies = z.record(z.string(), z.string()).optional();
export const manifestSchema = z.object({
  name: z.string().optional(),
  dependencies, optionalDependencies: dependencies, peerDependencies: dependencies,
  asterism: z.object({ id: z.string().min(1), build: buildConfigSchema }).passthrough(),
}).passthrough();
/** Author inputs read from package.json.asterism.build. Entry paths are package-relative.
 * public lists the bare specifiers this plugin provides per realm; they resolve through ordinary package
 * resolution (package exports, including self-references). Peer dependencies of the package are the
 * imports supplied at load time by the host or by other plugins.
 */
export type BuildConfig = z.infer<typeof buildConfigSchema>;
export type Realm = "runtime" | "renderer";

export const packageName = (request: string): string => /^(?:@[^/]+\/)?[^/]+/u.exec(request)?.[0] ?? request;
export const matchesPackage = (request: string, names: ReadonlySet<string>): boolean => names.has(packageName(request));
/** Bare requests name packages; relative, absolute, and URL-like requests do not. */
export const isBareRequest = (request: string): boolean => !/^(?:[./]|[A-Za-z]:[\\/]|[a-z][a-z0-9+.-]*:)/u.test(request);
