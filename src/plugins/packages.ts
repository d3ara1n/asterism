import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, isAbsolute, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import * as zod from "zod";
import * as sdkContracts from "@asterism/sdk/contracts";
import * as sdkRuntime from "@asterism/sdk/runtime";
import sdkMetadata from "@asterism/sdk/package.json" with { type: "json" };
import type { PluginDefinition, PluginStorageDeclaration } from "@asterism/sdk/runtime";
import type { Plugin } from "esbuild";
import { compileModules, packageModule, type PackageModule } from "./package-modules.ts";
import { loadCatalogs } from "./catalogs.ts";
import { localeSchema, uiTextSchema, pluginMetadataSchema, type PluginMetadata } from "@asterism/sdk/contracts";
import type { TranslationCatalog } from "../shared/i18n.ts";
import type { PublicProvider } from "../shared/public-modules.ts";
import { jsonStorage } from "../storage/migrations.ts";

/** Plugin package manifest: the asterism field in package.json, shared by source and release artifacts. */
export const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u),
  runtime: z.string().min(1).optional(),
  renderer: z.string().min(1).optional(),
  /** Storage declaration entry: default export `defineStorage([...])`, imported separately by the host before plugin runtime. */
  storage: z.string().min(1).optional(),
  /** Package-relative directories exposed by the manual without executing plugin code. */
  manual: z.array(z.string().min(1)).optional(),
  displayName: uiTextSchema.optional(),
  description: uiTextSchema.optional(),
  icon: z.string().min(1).optional(),
  i18n: z.strictObject({ catalogs: z.record(z.string().refine(value => localeSchema.safeParse(value).success, "Invalid language tag."), z.string().min(1)) }).superRefine((value, context) => {
    const locales = Object.keys(value.catalogs).flatMap(tag => {
      const parsed = localeSchema.safeParse(tag); return parsed.success ? [parsed.data] : [];
    });
    if (new Set(locales).size !== locales.length) context.addIssue({ code: "custom", message: "Duplicate catalog locale." });
  }).optional(),
});
export type PluginPackageManifest = z.infer<typeof manifestSchema>;

/** Package information is independent of code loading, so failed or disabled plugins can still display. */
export function readPackageMetadata(root: string): PluginMetadata {
  const pkg = z.object({
    name: z.string().optional(), version: z.string().optional(), description: z.string().optional(),
    author: z.union([z.string(), z.object({ name: z.string() })]).optional(),
    asterism: z.object({ displayName: uiTextSchema.optional(), description: uiTextSchema.optional(), icon: z.string().optional() }).optional(),
  }).parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  let icon: string | undefined;
  if (pkg.asterism?.icon) {
    const file = realpathSync(resolve(root, pkg.asterism.icon));
    const inside = relative(realpathSync(root), file);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error("Plugin icon must be inside the package.");
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" } as Record<string, string>)[extname(file).toLowerCase()];
    if (!mime) throw new Error("Plugin icon must be a PNG, JPEG, WebP or SVG image.");
    icon = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
  }
  return pluginMetadataSchema.parse({ name: pkg.asterism?.displayName ?? pkg.name, description: pkg.asterism?.description ?? pkg.description,
    version: pkg.version, author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name, icon });
}

/** One management-list entry: source determines only the package root location; enabled state is independent of source. */
export const packageEntrySchema = z.strictObject({
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("path"), path: z.string().min(1) }),
    z.strictObject({ kind: z.literal("npm"), name: z.string().min(1), version: z.string().min(1) }),
  ]),
  enabled: z.boolean(),
});
export type PackageEntry = z.infer<typeof packageEntrySchema>;
/** Plugin list format; increment on changes and append migrations to `packageListStorage`. */
const packageListVersion = 1;
const listSchema = z.strictObject({ version: z.literal(packageListVersion), packages: z.array(packageEntrySchema) });
export function packageListStorage(root: string) {
  return jsonStorage({ id: "plugins", file: join(root, "plugins.json"), version: packageListVersion, migrations: {} });
}

export class PluginPackageError extends Error {
  constructor(readonly code: "not_a_package" | "invalid_manifest" | "duplicate" | "build_failed" | "invalid_entry", message: string) { super(message); }
}

/** Source adapter: yields only a package root; later stages no longer distinguish sources. */
export function packageRoot(entry: PackageEntry, npmRoot: string): string {
  return entry.source.kind === "path" ? resolve(entry.source.path) : join(npmRoot, "node_modules", entry.source.name);
}

/** Read and validate the package root manifest; paths must be package roots without downward search. */
export function readManifest(root: string): PluginPackageManifest {
  const file = join(root, "package.json");
  if (!existsSync(file)) throw new PluginPackageError("not_a_package", `No package.json at ${root}.`);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new PluginPackageError("invalid_manifest", `package.json at ${root} is not valid JSON.`); }
  const parsed = manifestSchema.safeParse((raw as { asterism?: unknown } | null)?.asterism);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(issue => `asterism.${issue.path.join(".") || "(root)"}`).join(", ");
    throw new PluginPackageError("invalid_manifest", `Package at ${root} has no valid Asterism manifest: ${fields}.`);
  }
  const manifest = parsed.data;
  for (const entry of [manifest.runtime, manifest.renderer, manifest.storage]) {
    if (entry && relative(root, resolve(root, entry)).startsWith("..")) throw new PluginPackageError("invalid_entry", `Entry ${entry} is outside the package.`);
  }
  const paths: string[] = [];
  for (const path of manifest.manual ?? []) {
    if (path.includes("\\") || path.includes("\0") || posix.isAbsolute(path) || win32.isAbsolute(path)
      || path !== posix.normalize(path) || path.split("/").some(part => !part || part === "." || part === ".."))
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} must be a normalized package-relative subdirectory.`);
    if (paths.some(other => path === other || path.startsWith(`${other}/`) || other.startsWith(`${path}/`)))
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} overlaps another declared directory.`);
    try {
      const directory = realpathSync(resolve(root, path));
      const inside = relative(realpathSync(root), directory);
      if (!inside || inside.split(/[\\/]/u).includes("..") || isAbsolute(inside) || !statSync(directory).isDirectory())
        throw new Error("Not a package subdirectory.");
    } catch {
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} must resolve to an existing directory inside the package.`);
    }
    paths.push(path);
  }
  return manifest;
}

/** Package list persistence: `<data>/plugins.json`; changes take effect after restart. */
export class PackageList {
  constructor(private readonly file: string) {}
  read(): PackageEntry[] {
    if (!existsSync(this.file)) return [];
    return listSchema.parse(JSON.parse(readFileSync(this.file, "utf8"))).packages;
  }
  private write(packages: PackageEntry[]): void {
    mkdirSync(join(this.file, ".."), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: packageListVersion, packages }, null, 2), { flush: true });
    renameSync(temporary, this.file);
  }
  /** Validate on addition: invalid packages fail without entries; new entries are enabled by default. */
  add(entry: Omit<PackageEntry, "enabled">, npmRoot: string): PluginPackageManifest {
    const manifest = readManifest(packageRoot({ ...entry, enabled: true }, npmRoot));
    const packages = this.read();
    for (const existing of packages) {
      try { if (readManifest(packageRoot(existing, npmRoot)).id === manifest.id) throw new PluginPackageError("duplicate", `Plugin ${manifest.id} is already added.`); }
      catch (error) { if (error instanceof PluginPackageError && error.code === "duplicate") throw error; }
    }
    this.write([...packages, { ...entry, enabled: true }]);
    return manifest;
  }
  setEnabled(index: number, enabled: boolean): void {
    const packages = this.read();
    if (!packages[index]) throw new PluginPackageError("invalid_entry", "No such package entry.");
    packages[index] = { ...packages[index], enabled };
    this.write(packages);
  }
  remove(index: number): void { this.write(this.read().filter((_, i) => i !== index)); }
}

/**
 * Host shared modules: forward these imports to already loaded instances;
 * package-modules builds plugin public modules and other dependencies into an ESM graph.
 */
const shared: Record<string, Record<string, unknown>> = {
  zod: zod as Record<string, unknown>,
  "@asterism/sdk/contracts": sdkContracts as Record<string, unknown>,
  "@asterism/sdk/runtime": sdkRuntime as Record<string, unknown>,
};
const sharedGlobal = "__asterismSharedModules";
(globalThis as Record<string, unknown>)[sharedGlobal] = shared;
function sharedModuleSource(id: string): string {
  const names = Object.keys(shared[id]!).filter(name => name !== "default" && /^[A-Za-z_$][\w$]*$/u.test(name));
  return [`const m = globalThis[${JSON.stringify(sharedGlobal)}][${JSON.stringify(id)}];`,
    `export default m.default ?? m;`, ...names.map((name, index) =>
      `const shared${index} = m[${JSON.stringify(name)}]; export { shared${index} as ${name} };`)].join("\n");
}

/** Renderer shared modules: the host page supplies the same instances through window.__asterismRendererModules. */
export const rendererShared: readonly string[] = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-intl", "zod", "@asterism/sdk/contracts", "@asterism/sdk/renderer"];
function rendererModuleSource(id: string): string {
  // CJS forwarding: esbuild interop reads named imports as properties of the same instance.
  return `const m = globalThis.__asterismRendererModules[${JSON.stringify(id)}]; module.exports = m;`;
}

/** Host libraries retain existing instances; plugin public modules share the same ESM graph. */
function hostModules(realm: "runtime" | "renderer"): Plugin {
  return { name: "asterism-host-modules", setup(build) {
    build.onResolve({ filter: /.*/ }, args => (realm === "runtime" ? args.path in shared : rendererShared.includes(args.path))
      ? { path: args.path, namespace: "asterism-host" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "asterism-host" }, args => ({
      contents: realm === "runtime" ? sharedModuleSource(args.path) : rendererModuleSource(args.path), loader: "js",
    }));
  } };
}

export interface ResolvedPackage {
  dependencies?: string[];
  /** Runtime providers requiring setup, including providers reached through public-only packages. */
  runtimeDependencies?: string[];
  rendererDependencies?: string[];
  catalogs?: TranslationCatalog[];
  entry: PackageEntry;
  root: string;
  manifest: PluginPackageManifest | null;
  status: "loaded" | "disabled" | "invalid" | "failed";
  error?: string;
  definition?: PluginDefinition;
  /** Storage entry default export; runtime and preparation processes use the same declaration to handle format versions. */
  storage?: readonly PluginStorageDeclaration[];
  /** Entry path relative to the renderer cache root. */
  renderer?: string;
  stylesheet?: string;
}

/** Import a built entry; individual plugin imports have a fixed deadline. */
async function importEntry(id: string, file: string, label: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const module = await Promise.race([
    import(pathToFileURL(file).href) as Promise<{ default?: unknown }>,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Plugin ${id} ${label} import timed out.`)), 10_000); }),
  ]).finally(() => clearTimeout(timer));
  return module.default;
}
/** Storage declarations check structural shape only; migration chains and plugins own format contents. */
function storageDeclarations(id: string, value: unknown): readonly PluginStorageDeclaration[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || (item.kind !== "json" && item.kind !== "sqlite")
    || typeof item.path !== "string" || !Number.isSafeInteger(item.version) || item.version < 1 || !item.migrations || typeof item.migrations !== "object"))
    throw new PluginPackageError("invalid_entry", `Storage entry of ${id} must default-export defineStorage([...]).`);
  return value as readonly PluginStorageDeclaration[];
}

/** Read lists, validate manifests and conflicts, bundle and import enabled plugins; propagate failures to dependents. `runtime: false` imports storage entries only. */
export async function loadPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[],
  publicProviders: readonly PublicProvider[] = [], progress: (id: string) => void = () => {},
  options: { runtime?: boolean } = {}): Promise<ResolvedPackage[]> {
  const result: ResolvedPackage[] = [];
  const ids = new Map<string, number>();
  for (const entry of list.read()) {
    const root = packageRoot(entry, npmRoot);
    try {
      const manifest = readManifest(root);
      result.push({ entry, root, manifest, status: entry.enabled ? "loaded" : "disabled" });
      ids.set(manifest.id, (ids.get(manifest.id) ?? 0) + 1);
    } catch (error) {
      result.push({ entry, root, manifest: null, status: "invalid", error: error instanceof Error ? error.message : String(error) });
    }
  }
  const modules: PackageModule[] = [];
  for (const item of result) {
    if (!item.manifest) continue;
    const id = item.manifest.id;
    try {
      if (item.status === "loaded" && (reserved.includes(id) || (ids.get(id) ?? 0) > 1))
        throw new PluginPackageError("duplicate", `Plugin ID ${id} is reserved or registered more than once.`);
      modules.push(packageModule(item.root, item.manifest));
    } catch (error) {
      item.status = "failed"; item.error = error instanceof Error ? error.message : String(error);
    }
  }
  const hostIdentity = JSON.stringify({ sdkVersion: sdkMetadata.version, runtime: Object.keys(shared).sort().map(id => sharedModuleSource(id)),
    renderer: rendererShared.map(id => rendererModuleSource(id)) });
  const compiled = await compileModules(modules, new Set(result.filter(item => item.status === "loaded").map(item => item.manifest!.id)),
    cacheRoot, hostModules, publicProviders, hostIdentity, progress);
  for (const item of result) {
    if (item.status !== "loaded") continue;
    const id = item.manifest!.id;
    item.dependencies = [...compiled.dependencies.get(id) ?? []];
    item.rendererDependencies = [...compiled.rendererDependencies.get(id) ?? []];
    try {
      if (compiled.failures.has(id)) throw new PluginPackageError("build_failed", compiled.failures.get(id)!);
      const renderer = compiled.renderer.get(id);
      if (renderer) item.renderer = relative(cacheRoot, renderer).split("\\").join("/");
      const stylesheet = compiled.stylesheets.get(id);
      if (stylesheet) item.stylesheet = relative(cacheRoot, stylesheet).split("\\").join("/");
      const storage = compiled.storage.get(id);
      if (storage) item.storage = storageDeclarations(id, await importEntry(id, storage, "storage"));
      const file = compiled.runtime.get(id);
      if (!file || options.runtime === false) continue;
      progress(id);
      const definition = await importEntry(id, file, "runtime") as PluginDefinition | undefined;
      if (!definition || typeof definition !== "object" || definition.namespace?.id !== id
        || (definition.setup !== undefined && typeof definition.setup !== "function")
        || (definition.modules !== undefined && (!Array.isArray(definition.modules) || definition.modules.some(module => !module || typeof module.setup !== "function"))))
        throw new PluginPackageError("invalid_entry", `Runtime entry of ${id} must default-export definePlugin(...) with namespace ${id}.`);
      item.definition = definition;
    } catch (error) {
      item.status = "failed"; item.error = error instanceof Error ? error.message : String(error);
    }
  }
  // Propagate import failures to dependents too; consumers cannot enter setup with public services from failed providers.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of result) if (item.status === "loaded") {
      const failed = [...compiled.dependencies.get(item.manifest!.id) ?? []].find(id => result.some(provider => provider.manifest?.id === id && provider.status !== "loaded"));
      if (failed) {
        item.status = "failed"; item.error = `Public dependency ${failed} is unavailable.`;
        delete item.definition; delete item.renderer; delete item.stylesheet; delete item.storage; changed = true;
      }
    }
  }
  // Pure public packages have no setup; traverse dependencies so actual service providers initialize first.
  const dependenciesOf = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    return [...compiled.runtimeDependencies.get(id) ?? []].flatMap(dependency =>
      publicProviders.some(provider => provider.pluginId === dependency) || result.some(item => item.manifest?.id === dependency && item.definition)
        ? [dependency] : dependenciesOf(dependency, visited));
  };
  for (const item of result) if (item.definition) item.runtimeDependencies = dependenciesOf(item.manifest!.id);
  for (const item of result) if (item.status === "loaded" && item.manifest?.i18n)
    item.catalogs = loadCatalogs(item.root, item.manifest.id, item.manifest.i18n.catalogs);
  return result;
}
