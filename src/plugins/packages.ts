import { pathWithin } from "../storage/paths.ts";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { z } from "zod";
import * as zod from "zod";
import * as sdkContracts from "@asterism-app/sdk/contracts";
import * as sdkRuntime from "@asterism-app/sdk/runtime";
import type { PluginDefinition, PluginStorageDeclaration, ManualSource } from "@asterism-app/sdk/runtime";
import type { Plugin } from "esbuild";
import { applicationDirectory, compileModules, packageModule, type PackageModule } from "./package-modules.ts";
import { loadCatalogs } from "./catalogs.ts";
import { localeSchema, uiTextSchema, pluginMetadataSchema, type PluginMetadata } from "@asterism-app/sdk/contracts";
import type { PublicProvider } from "../shared/public-modules.ts";
import { jsonStorage } from "../storage/migrations.ts";
import { isRendererShared } from "../shared/renderer-modules.ts";
import { translationCatalogSchema } from "../shared/language.ts";
import { pluginDiagnosticSchema, pluginErrorMessage, type PluginCandidate } from "../shared/plugin-startup.ts";
import { PluginAvailability } from "./availability.ts";

/** Plugin package manifest: the asterism field in package.json, shared by source and release artifacts. */
export const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u),
  runtime: z.string().min(1).optional(),
  renderer: z.string().min(1).optional(),
  /** Storage declaration entry: default export `defineStorage([...])`, imported separately by the host before plugin runtime. */
  storage: z.string().min(1).optional(),
  /** Public dependency packages whose exports form this plugin's API. */
  publicPackages: z.array(z.string().min(1)).optional(),
  /** Runtime packages kept intact so native binaries and package-relative assets retain their locations. */
  runtimeExternals: z.array(z.string().min(1)).optional(),
  /** Package-relative directories exposed by the manual without executing plugin code. */
  manual: z.array(z.string().min(1)).optional(),
  /** The plugin name shown wherever the application names this plugin. */
  displayName: uiTextSchema,
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
    if (!pathWithin(realpathSync(root), file)) throw new Error("Plugin icon must be inside the package.");
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
    z.strictObject({ kind: z.literal("bundled"), name: z.string().regex(/^[a-z0-9-]+$/u) }),
    z.strictObject({ kind: z.literal("path"), path: z.string().min(1) }),
    z.strictObject({ kind: z.literal("npm"), name: z.string().min(1), version: z.string().min(1) }),
  ]),
  enabled: z.boolean(),
});
export type PackageEntry = z.infer<typeof packageEntrySchema>;
/** Plugin list format; increment on changes and append migrations to `packageListStorage`. */
const packageListVersion = 2;
const listSchema = z.strictObject({ version: z.literal(packageListVersion), packages: z.array(packageEntrySchema) });
export function packageListStorage(root: string) {
  return jsonStorage({ id: "plugins", file: join(root, "plugins.json"), version: packageListVersion, migrations: {} });
}

export class PluginPackageError extends Error {
  constructor(readonly code: "not_a_package" | "invalid_manifest" | "duplicate" | "build_failed" | "invalid_entry", message: string) { super(message); }
}

/** Source adapter: yields only a package root; later stages no longer distinguish sources. */
export function packageRoot(entry: PackageEntry, npmRoot: string): string {
  if (entry.source.kind === "bundled") return applicationDirectory(`packages/${entry.source.name}`);
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
    if (entry && !pathWithin(root, resolve(root, entry))) throw new PluginPackageError("invalid_entry", `Entry ${entry} is outside the package.`);
  }
  manualDirectories(root, manifest.manual ?? []);
  return manifest;
}

/** Both plugin packages and their declared public libraries retain their own manual boundaries. */
function manualDirectories(root: string, declared: readonly string[]): ManualSource[] {
  const paths: string[] = [], sources: ManualSource[] = [];
  for (const path of declared) {
    if (path.includes("\\") || path.includes("\0") || posix.isAbsolute(path) || win32.isAbsolute(path)
      || path !== posix.normalize(path) || path.split("/").some(part => !part || part === "." || part === ".."))
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} must be a normalized package-relative subdirectory.`);
    if (paths.some(other => path === other || path.startsWith(`${other}/`) || other.startsWith(`${path}/`)))
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} overlaps another declared directory.`);
    try {
      const directory = realpathSync(resolve(root, path));
      if (!pathWithin(realpathSync(root), directory) || !statSync(directory).isDirectory())
        throw new Error("Not a package subdirectory.");
      sources.push({ path, directory });
    } catch {
      throw new PluginPackageError("invalid_entry", `Manual directory ${path} must resolve to an existing directory inside the package.`);
    }
    paths.push(path);
  }
  return sources;
}

function packageManuals(root: string, manifest: PluginPackageManifest): ManualSource[] {
  const sources = manualDirectories(root, manifest.manual ?? []);
  const require = createRequire(join(root, "package.json"));
  for (const name of manifest.publicPackages ?? []) {
    const directory = require.resolve.paths(name)?.map(path => join(path, name)).find(path => existsSync(join(path, "package.json")));
    if (!directory) throw new PluginPackageError("invalid_entry", `Public package ${name} is not installed for ${manifest.id}.`);
    const metadata = z.object({ asterism: z.object({ manual: z.array(z.string()).optional() }).optional() })
      .parse(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")));
    sources.push(...manualDirectories(directory, metadata.asterism?.manual ?? []).map(source => ({
      ...source, path: `public/${name}/${source.path}`,
    })));
  }
  return sources.map(source => ({ ...source, path: `plugins/${manifest.id}/${source.path}` }));
}

/** Package list persistence: `<data>/plugins.json`; changes take effect after restart. */
export class PackageList {
  constructor(private readonly file: string, private readonly defaults: readonly PackageEntry[] = []) {}
  read(): PackageEntry[] {
    if (!existsSync(this.file)) return structuredClone([...this.defaults]);
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
  "@asterism-app/sdk/contracts": sdkContracts as Record<string, unknown>,
  "@asterism-app/sdk/runtime": sdkRuntime as Record<string, unknown>,
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
function rendererModuleSource(id: string): string {
  // CJS forwarding: esbuild interop reads named imports as properties of the same instance.
  return `const m = globalThis.__asterismRendererModules[${JSON.stringify(id)}];`
    + ` if (!m) throw new Error(${JSON.stringify(`The host does not provide renderer module ${id}.`)}); module.exports = m;`;
}

/** Host libraries retain existing instances; plugin public modules share the same ESM graph. */
function hostModules(realm: "runtime" | "renderer"): Plugin {
  return { name: "asterism-host-modules", setup(build) {
    build.onResolve({ filter: /.*/ }, args => (realm === "runtime" ? args.path in shared : isRendererShared(args.path))
      ? { path: args.path, namespace: "asterism-host" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "asterism-host" }, args => ({
      contents: realm === "runtime" ? sharedModuleSource(args.path) : rendererModuleSource(args.path), loader: "js",
    }));
  } };
}

/** Serializable build result shared by storage preparation and the task process within one startup. */
export const builtPackageSchema = z.object({
  entry: packageEntrySchema, root: z.string(), manifest: manifestSchema.nullable(),
  metadata: pluginMetadataSchema, metadataError: z.string().optional(),
  status: z.enum(["ready", "disabled", "invalid", "failed"]),
  diagnostic: pluginDiagnosticSchema.optional(),
  dependencies: z.array(z.string()), runtimeDependencies: z.array(z.string()), rendererDependencies: z.array(z.string()),
  manualSources: z.array(z.object({ path: z.string(), directory: z.string() })).optional(),
  catalogs: z.array(translationCatalogSchema).optional(),
  runtime: z.string().optional(), storageEntry: z.string().optional(),
  renderer: z.string().optional(), stylesheet: z.string().optional(),
});
export type BuiltPackage = z.infer<typeof builtPackageSchema>;
export interface ResolvedPackage extends BuiltPackage {
  definition?: PluginDefinition;
  storage?: readonly PluginStorageDeclaration[];
}

export function packageCandidates(packages: readonly BuiltPackage[]): PluginCandidate[] {
  return packages.map(item => ({
    source: packageSource(item.entry), enabled: item.entry.enabled, id: item.manifest?.id ?? null,
    status: item.status, diagnostic: item.diagnostic, renderer: item.renderer ?? null, stylesheet: item.stylesheet ?? null,
    metadata: item.metadata, metadataError: item.metadataError,
    dependencies: item.dependencies, rendererDependencies: item.rendererDependencies,
  }));
}

function packageAvailability(packages: readonly BuiltPackage[]) {
  return new PluginAvailability(packages.flatMap(item => item.manifest ? [{
    id: item.manifest.id, dependencies: item.dependencies, diagnostic: item.diagnostic, unavailable: item.status !== "ready",
  }] : []));
}
function applyAvailability(packages: BuiltPackage[], availability: PluginAvailability): void {
  for (const item of packages) {
    const failure = item.manifest && availability.get(item.manifest.id);
    if (item.status === "ready" && failure) { item.status = "failed"; item.diagnostic = failure; }
  }
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

/** Discover and compile once per startup. No executable entry runs during this stage. */
export async function buildPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[] = [],
  publicProviders: readonly PublicProvider[] = [], progress: (id: string) => void = () => {}): Promise<BuiltPackage[]> {
  const result: BuiltPackage[] = [];
  const ids = new Map<string, number>();
  for (const entry of list.read()) {
    const root = packageRoot(entry, npmRoot);
    let metadata: PluginMetadata = {}, metadataError: string | undefined;
    try { metadata = readPackageMetadata(root); } catch (error) { metadataError = pluginErrorMessage(error); }
    try {
      const manifest = readManifest(root);
      result.push({ entry, root, manifest, metadata, metadataError, status: entry.enabled ? "ready" : "disabled", dependencies: [], runtimeDependencies: [], rendererDependencies: [] });
      ids.set(manifest.id, (ids.get(manifest.id) ?? 0) + 1);
    } catch (error) {
      result.push({ entry, root, manifest: null, metadata, metadataError, status: "invalid", diagnostic: { stage: "discovery", message: pluginErrorMessage(error) },
        dependencies: [], runtimeDependencies: [], rendererDependencies: [] });
    }
  }
  const modules: PackageModule[] = [];
  for (const item of result) {
    if (!item.manifest) continue;
    const id = item.manifest.id;
    try {
      if (item.status === "ready" && (reserved.includes(id) || (ids.get(id) ?? 0) > 1))
        throw new PluginPackageError("duplicate", `Plugin ID ${id} is reserved or registered more than once.`);
      modules.push(packageModule(item.root, item.manifest));
    } catch (error) {
      item.status = "failed"; item.diagnostic = { stage: "discovery", message: pluginErrorMessage(error) };
    }
  }
  const compiled = await compileModules(modules, new Set(result.filter(item => item.status === "ready").map(item => item.manifest!.id)),
    cacheRoot, hostModules, publicProviders, progress);
  const artifact = (file: string | undefined) => file ? relative(cacheRoot, file).split("\\").join("/") : undefined;
  for (const item of result) {
    if (item.status !== "ready") continue;
    const id = item.manifest!.id;
    item.dependencies = [...compiled.dependencies.get(id) ?? []];
    item.runtimeDependencies = [...compiled.runtimeDependencies.get(id) ?? []];
    item.rendererDependencies = [...compiled.rendererDependencies.get(id) ?? []];
    try {
      if (compiled.failures.has(id)) throw new PluginPackageError("build_failed", compiled.failures.get(id)!);
      item.manualSources = packageManuals(item.root, item.manifest!);
      item.renderer = artifact(compiled.renderer.get(id));
      item.stylesheet = artifact(compiled.stylesheets.get(id));
      item.storageEntry = artifact(compiled.storage.get(id));
      item.runtime = artifact(compiled.runtime.get(id));
      if (item.manifest!.i18n) item.catalogs = loadCatalogs(item.root, id, item.manifest!.i18n.catalogs);
    } catch (error) {
      item.status = "failed"; item.diagnostic = { stage: "build", message: pluginErrorMessage(error) };
    }
  }
  applyAvailability(result, packageAvailability(result));
  return result;
}

/** Import the captured artifacts; storage admission applies to every package, including packages without runtime entries. */
export async function importPackages(packages: readonly BuiltPackage[], cacheRoot: string,
  options: { runtime?: boolean; storageFailures?: ReadonlyMap<string, string>; progress?: (id: string) => void } = {}): Promise<ResolvedPackage[]> {
  const result: ResolvedPackage[] = structuredClone([...packages]);
  const availability = packageAvailability(result);
  for (const [id, message] of options.storageFailures ?? []) availability.fail(id, { stage: "storage", message });
  for (const item of result) {
    if (item.status !== "ready" || availability.get(item.manifest!.id)) continue;
    const id = item.manifest!.id;
    let stage: "storage" | "import" = "storage";
    try {
      if (item.storageEntry) item.storage = storageDeclarations(id, await importEntry(id, resolve(cacheRoot, item.storageEntry), "storage"));
      if (!item.runtime || options.runtime === false) continue;
      stage = "import";
      options.progress?.(id);
      const definition = await importEntry(id, resolve(cacheRoot, item.runtime), "runtime") as PluginDefinition | undefined;
      if (!definition || typeof definition !== "object" || definition.namespace?.id !== id
        || (definition.setup !== undefined && typeof definition.setup !== "function")
        || (definition.modules !== undefined && (!Array.isArray(definition.modules) || definition.modules.some(module => !module || typeof module.setup !== "function"))))
        throw new PluginPackageError("invalid_entry", `Runtime entry of ${id} must default-export definePlugin(...) with namespace ${id}.`);
      item.definition = definition;
    } catch (error) {
      availability.fail(id, { stage, message: pluginErrorMessage(error) });
    }
  }
  applyAvailability(result, availability);
  for (const item of result) if (item.status !== "ready") { delete item.definition; delete item.storage; }
  return result;
}

/** Collapse public-only intermediaries for backend setup order without importing frontend dependency edges. */
export function runtimeDependencies(packages: readonly ResolvedPackage[], publicProviders: readonly PublicProvider[] = []): Map<string, string[]> {
  // Pure public packages have no setup; traverse dependencies so actual service providers initialize first.
  const dependenciesOf = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    return (packages.find(item => item.manifest?.id === id)?.runtimeDependencies ?? []).flatMap(dependency =>
      publicProviders.some(provider => provider.pluginId === dependency) || packages.some(item => item.manifest?.id === dependency && item.definition)
        ? [dependency] : dependenciesOf(dependency, visited));
  };
  return new Map(packages.flatMap(item => item.definition ? [[item.manifest!.id, dependenciesOf(item.manifest!.id)] as const] : []));
}

/** Standalone package loading for tools and isolated contract checks. Application startup shares build results across processes. */
export async function loadPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[],
  publicProviders: readonly PublicProvider[] = [], progress: (id: string) => void = () => {}): Promise<ResolvedPackage[]> {
  return importPackages(await buildPackages(list, npmRoot, cacheRoot, reserved, publicProviders, progress), cacheRoot, { progress });
}

/** Stable source identity is independent of the installed application directory. */
export function packageSource(entry: PackageEntry): string {
  return entry.source.kind === "path" ? entry.source.path
    : entry.source.kind === "bundled" ? `bundled:${entry.source.name}` : `${entry.source.name}@${entry.source.version}`;
}
