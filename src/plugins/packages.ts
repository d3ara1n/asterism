import { pathWithin } from "../storage/paths.ts";
import { applicationStorage } from "../shared/application.ts";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { z } from "zod";
import * as zod from "zod";
import * as sdkContracts from "@asterism-app/sdk/contracts";
import * as sdkRuntime from "@asterism-app/sdk/runtime";
import type { PluginDefinition, PluginStorageDeclaration, ManualSource } from "@asterism-app/sdk/runtime";
import { applicationDirectory } from "./package-modules.ts";
import { captureArtifact, artifactPath } from "./artifact-resolver.ts";
import { registerArtifactModules, rendererImportMap, artifactRoots } from "./native-modules.ts";
import { artifactSchema } from "@asterism-app/plugin-build/artifact";
export { rendererImportMap, artifactRoots };
import { loadCatalogs } from "./catalogs.ts";
import { localeSchema, uiTextSchema, pluginMetadataSchema, type PluginMetadata } from "@asterism-app/sdk/contracts";
import { jsonStorage } from "../storage/migrations.ts";
import { isRendererShared, rendererSharedModules, sharedUiPackage } from "../shared/renderer-modules.ts";
import { randomUUID } from "node:crypto";
import { translationCatalogSchema } from "../shared/language.ts";
import { pluginDiagnosticSchema, pluginErrorMessage, type PluginCandidate } from "../shared/plugin-startup.ts";
import { PluginAvailability } from "./availability.ts";

/** Plugin package manifest: the asterism field in package.json, shared by source and release artifacts. */
export const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u),
  artifact: z.string().min(1),
  publicPackages: z.array(z.string().min(1)).optional(),
  /** Authoring configuration is owned by the build tool, not interpreted by the host. */
  build: z.unknown().optional(),
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
    z.strictObject({ kind: z.literal("npm"), name: z.string().min(1), version: z.string().min(1), installation: z.string().regex(/^[A-Za-z0-9_-]+$/u).optional() }),
  ]),
  enabled: z.boolean(),
});
export type PackageEntry = z.infer<typeof packageEntrySchema>;
/** Plugin list format; increment on changes and append migrations to `packageListStorage`. */
const packageListVersion = 2;
const listSchema = z.strictObject({ version: z.literal(packageListVersion), packages: z.array(packageEntrySchema) });
export function packageListStorage(root: string) {
  return jsonStorage({ id: "plugins", file: join(root, applicationStorage.pluginListFile), version: packageListVersion, migrations: {} });
}

export class PluginPackageError extends Error {
  constructor(readonly code: "not_a_package" | "invalid_manifest" | "duplicate" | "build_failed" | "invalid_entry", message: string) { super(message); }
}

/** Source adapter: yields only a package root; later stages no longer distinguish sources. */
export function packageRoot(entry: PackageEntry, npmRoot: string): string {
  if (entry.source.kind === "bundled") return applicationDirectory(`packages/${entry.source.name}`);
  return entry.source.kind === "path" ? resolve(entry.source.path) : entry.source.installation ? join(npmRoot, applicationStorage.pluginInstallationsDirectory, entry.source.installation, "node_modules", entry.source.name) : join(npmRoot, "node_modules", entry.source.name);
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
  artifactPath(root, manifest.artifact);
  manualDirectories(root, manifest.manual ?? []);
  return manifest;
}

/** Acquisition validates the selected completed output without importing runtime or migration entries. */
export function validatePackageArtifact(root: string): PluginPackageManifest {
  const manifest = readManifest(root);
  captureArtifact(root, manifest.artifact, manifest.id);
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
  const owned = manifest.publicPackages ?? [];
  for (const name of owned) {
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
    const manifest = validatePackageArtifact(packageRoot({ ...entry, enabled: true }, npmRoot));
    const packages = this.read();
    for (const existing of packages) {
      try { if (readManifest(packageRoot(existing, npmRoot)).id === manifest.id) throw new PluginPackageError("duplicate", `Plugin ${manifest.id} is already added.`); }
      catch (error) { if (error instanceof PluginPackageError && error.code === "duplicate") throw error; }
    }
    this.write([...packages, { ...entry, enabled: true }]);
    return manifest;
  }
  /** Replace a selected installation after acquisition; validate identity conflicts before publishing. */
  replace(index: number, entry: PackageEntry, npmRoot: string): PluginPackageManifest {
    const packages = this.read();
    if (!packages[index]) throw new PluginPackageError("invalid_entry", "No such package entry.");
    const manifest = validatePackageArtifact(packageRoot(entry, npmRoot));
    for (const [otherIndex, existing] of packages.entries()) {
      if (otherIndex === index) continue;
      try { if (readManifest(packageRoot(existing, npmRoot)).id === manifest.id) throw new PluginPackageError("duplicate", `Plugin ${manifest.id} is already added.`); }
      catch (error) { if (error instanceof PluginPackageError && error.code === "duplicate") throw error; }
    }
    packages[index] = entry;
    this.write(packages);
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

/** Host facades preserve stable exported values, while plugin-public entries remain native ESM. */
export const sharedRuntimeModules: Record<string, Record<string, unknown>> = {
  zod: zod as Record<string, unknown>,
  "@asterism-app/sdk/contracts": sdkContracts as Record<string, unknown>,
  "@asterism-app/sdk/runtime": sdkRuntime as Record<string, unknown>,
};

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
  renderer: z.string().optional(), stylesheet: z.string().optional(), stylesheets: z.array(z.string()).default([]),
  artifact: artifactSchema.optional(), artifactRoot: z.string().optional(), artifactKey: z.string().optional(),
});
export type BuiltPackage = z.infer<typeof builtPackageSchema>;
export interface ResolvedPackage extends BuiltPackage {
  definition?: PluginDefinition;
  storage?: readonly PluginStorageDeclaration[];
}

export function packageCandidates(packages: readonly BuiltPackage[]): PluginCandidate[] {
  return packages.map(item => ({
    source: packageSource(item.entry), enabled: item.entry.enabled, id: item.manifest?.id ?? null,
    status: item.status, diagnostic: item.diagnostic, renderer: item.renderer ?? null, stylesheet: item.stylesheet ?? null, stylesheets: item.stylesheets,
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

/** Capture completed builds once per startup. This stage executes no plugin entries and performs no source transformation. */
export async function buildPackages(list: PackageList, npmRoot: string, _cacheRoot: string, reserved: readonly string[] = [],
  progress: (id: string) => void = () => {}): Promise<BuiltPackage[]> {
  const result: BuiltPackage[] = [];
  const ids = new Map<string, number>();
  for (const entry of list.read()) {
    const root = packageRoot(entry, npmRoot);
    let metadata: PluginMetadata = {}, metadataError: string | undefined;
    try { metadata = readPackageMetadata(root); } catch (error) { metadataError = pluginErrorMessage(error); }
    const item: BuiltPackage = { entry, root, manifest: null, metadata, metadataError, status: "invalid",
      dependencies: [], runtimeDependencies: [], rendererDependencies: [], stylesheets: [] };
    result.push(item);
    try {
      item.manifest = readManifest(root);
      const id = item.manifest.id;
      ids.set(id, (ids.get(id) ?? 0) + 1);
      item.status = entry.enabled ? "ready" : "disabled";
      if (!entry.enabled) continue;
      progress(id);
      Object.assign(item, captureArtifact(root, item.manifest.artifact, id));
      item.artifactKey = randomUUID();
      const artifact = item.artifact!;
      item.runtime = artifact.runtime && artifactPath(item.artifactRoot!, artifact.runtime);
      item.storageEntry = artifact.storage && artifactPath(item.artifactRoot!, artifact.storage);
      item.renderer = artifact.renderer && `${item.artifactKey}/${artifact.renderer}`;
      item.stylesheets = artifact.stylesheets.map(path => `${item.artifactKey}/${path}`);
      item.manualSources = packageManuals(root, item.manifest);
      if (item.manifest.i18n) item.catalogs = loadCatalogs(root, id, item.manifest.i18n.catalogs);
    } catch (error) {
      item.status = item.manifest ? "failed" : "invalid";
      item.diagnostic = { stage: "discovery", message: pluginErrorMessage(error) };
    }
  }
  const fail = (item: BuiltPackage, message: string) => { item.status = "failed"; item.diagnostic = { stage: "dependency", message }; };
  for (const item of result) if (item.status === "ready" && (reserved.includes(item.manifest!.id) || ids.get(item.manifest!.id)! > 1))
    fail(item, `Plugin ID ${item.manifest!.id} is reserved or registered more than once.`);
  // A package is one public API owner even when different subpaths are used in different realms.
  const packageName = (specifier: string) => /^(?:@[^/]+\/)?[^/]+/u.exec(specifier)![0];
  const hostPackages = new Set([...Object.keys(sharedRuntimeModules), ...rendererSharedModules, sharedUiPackage].map(packageName));
  const owners = new Map<string, BuiltPackage>();
  for (const item of result) if (item.status === "ready") {
    const names = new Set([...Object.keys(item.artifact!.public.runtime), ...Object.keys(item.artifact!.public.renderer)]
      .map(packageName));
    for (const name of names) {
      if (hostPackages.has(name)) { fail(item, `Plugin cannot provide host package ${name}.`); continue; }
      const previous = owners.get(name);
      if (previous && previous !== item) {
        fail(previous, `Multiple plugins provide public package ${name}.`);
        fail(item, `Multiple plugins provide public package ${name}.`);
      } else owners.set(name, item);
    }
  }
  for (const realm of ["runtime", "renderer"] as const) {
    const providers = new Map<string, BuiltPackage>();
    for (const item of result) if (item.status === "ready") for (const specifier of Object.keys(item.artifact!.public[realm])) {
      if (realm === "runtime" ? Object.hasOwn(sharedRuntimeModules, specifier) : isRendererShared(specifier)) {
        fail(item, `Plugin cannot provide host module ${specifier}.`); continue;
      }
      const previous = providers.get(specifier);
      if (previous && previous !== item) { fail(previous, `Multiple plugins provide ${specifier} in ${realm}.`); fail(item, `Multiple plugins provide ${specifier} in ${realm}.`); }
      else providers.set(specifier, item);
    }
    for (const item of result) if (item.artifact && item.entry.enabled) {
      const dependencies = new Set<string>();
      for (const specifier of item.artifact.imports[realm]) {
        if (realm === "runtime" ? Object.hasOwn(sharedRuntimeModules, specifier) : isRendererShared(specifier)) continue;
        const provider = providers.get(specifier);
        if (!provider || provider.status !== "ready") { if (item.status === "ready") fail(item, `Public module ${specifier} has no available enabled provider in ${realm}.`); }
        else if (provider !== item) dependencies.add(provider.manifest!.id);
      }
      item[realm === "runtime" ? "runtimeDependencies" : "rendererDependencies"] = [...dependencies];
      item.dependencies = [...new Set([...item.dependencies, ...dependencies])];
    }
  }
  applyAvailability(result, packageAvailability(result));
  return result;
}

/** Import the captured artifacts; storage admission applies to every package, including packages without runtime entries. */
export async function importPackages(packages: readonly BuiltPackage[], cacheRoot: string,
  options: { runtime?: boolean; storageFailures?: ReadonlyMap<string, string>; progress?: (id: string) => void } = {}): Promise<ResolvedPackage[]> {
  const result: ResolvedPackage[] = structuredClone([...packages]);
  registerArtifactModules(result, sharedRuntimeModules);
  const availability = packageAvailability(result);
  for (const [id, message] of options.storageFailures ?? []) availability.fail(id, { stage: "storage", message });
  const visited = new Set<string>();
  const visit = async (item: ResolvedPackage): Promise<void> => {
    if (!item.manifest || visited.has(item.manifest.id)) return;
    const id = item.manifest.id;
    visited.add(id); // Native ESM handles module cycles; service setup ordering is checked separately.
    for (const dependency of item.runtimeDependencies) {
      const provider = result.find(candidate => candidate.manifest?.id === dependency);
      if (provider) await visit(provider);
    }
    if (item.status !== "ready" || availability.get(id)) return;
    let stage: "storage" | "import" = "storage";
    try {
      if (item.storageEntry) item.storage = storageDeclarations(id, await importEntry(id, item.storageEntry, "storage"));
      if (options.runtime === false) return;
      stage = "import";
      if (!item.runtime) return;
      options.progress?.(id);
      const definition = await importEntry(id, item.runtime, "runtime") as PluginDefinition | undefined;
      if (!definition || typeof definition !== "object" || definition.namespace?.id !== id
        || (definition.setup !== undefined && typeof definition.setup !== "function")
        || (definition.modules !== undefined && (!Array.isArray(definition.modules) || definition.modules.some(module => !module || typeof module.setup !== "function"))))
        throw new PluginPackageError("invalid_entry", `Runtime entry of ${id} must default-export definePlugin(...) with namespace ${id}.`);
      item.definition = definition;
    } catch (error) {
      availability.fail(id, { stage, message: pluginErrorMessage(error) });
    }
  };
  for (const item of result) await visit(item);
  applyAvailability(result, availability);
  for (const item of result) if (item.status !== "ready") { delete item.definition; delete item.storage; }
  return result;
}

/** Collapse public-only intermediaries for backend setup order without importing frontend dependency edges. */
export function runtimeDependencies(packages: readonly ResolvedPackage[]): Map<string, string[]> {
  // Pure public packages have no setup; traverse dependencies so actual service providers initialize first.
  const dependenciesOf = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    return (packages.find(item => item.manifest?.id === id)?.runtimeDependencies ?? []).flatMap(dependency =>
      packages.some(item => item.manifest?.id === dependency && item.definition)
        ? [dependency] : dependenciesOf(dependency, visited));
  };
  return new Map(packages.flatMap(item => item.definition ? [[item.manifest!.id, dependenciesOf(item.manifest!.id)] as const] : []));
}

/** Standalone package loading for tools and isolated contract checks. Application startup shares build results across processes. */
export async function loadPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[],
  progress: (id: string) => void = () => {}): Promise<ResolvedPackage[]> {
  return importPackages(await buildPackages(list, npmRoot, cacheRoot, reserved, progress), cacheRoot, { progress });
}

/** Stable source identity is independent of the installed application directory. */
export function packageSource(entry: PackageEntry): string {
  return entry.source.kind === "path" ? entry.source.path
    : entry.source.kind === "bundled" ? `bundled:${entry.source.name}` : `${entry.source.name}@${entry.source.version}`;
}
