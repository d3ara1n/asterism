import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import * as zod from "zod";
import * as sdkContracts from "@atelier/sdk/contracts";
import * as sdkRuntime from "@atelier/sdk/runtime";
import type { PluginDefinition } from "@atelier/sdk/runtime";
import type { Plugin } from "esbuild";
import { compileModules, packageModule, type PackageModule } from "./package-modules.ts";
import { loadCatalogs } from "./catalogs.ts";
import { localeSchema, uiTextSchema, pluginMetadataSchema, type PluginMetadata } from "@atelier/sdk/contracts";
import type { TranslationCatalog } from "../shared/i18n.ts";
import type { PublicProvider } from "../shared/public-modules.ts";

/** SDK API 版本；插件清单的 api.major 必须相同，minMinor 不得高于宿主。 */
export const sdkApi = { major: 15, minor: 2 } as const;

/** 插件包清单：package.json 的 atelier 字段；源码与发布产物读同一份。 */
export const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u),
  api: z.strictObject({ major: z.number().int().nonnegative(), minMinor: z.number().int().nonnegative() }),
  runtime: z.string().min(1).optional(),
  renderer: z.string().min(1).optional(),
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

/** 包信息独立于 API 兼容和代码装载，失败或禁用的插件也能显示。 */
export function readPackageMetadata(root: string): PluginMetadata {
  const pkg = z.object({
    name: z.string().optional(), version: z.string().optional(), description: z.string().optional(),
    author: z.union([z.string(), z.object({ name: z.string() })]).optional(),
    atelier: z.object({ displayName: uiTextSchema.optional(), description: uiTextSchema.optional(), icon: z.string().optional() }).optional(),
  }).parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  let icon: string | undefined;
  if (pkg.atelier?.icon) {
    const file = realpathSync(resolve(root, pkg.atelier.icon));
    const inside = relative(realpathSync(root), file);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error("Plugin icon must be inside the package.");
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" } as Record<string, string>)[extname(file).toLowerCase()];
    if (!mime) throw new Error("Plugin icon must be a PNG, JPEG, WebP or SVG image.");
    icon = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
  }
  return pluginMetadataSchema.parse({ name: pkg.atelier?.displayName ?? pkg.name, description: pkg.atelier?.description ?? pkg.description,
    version: pkg.version, author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name, icon });
}

/** 管理列表的一项：来源只决定包根在哪里，启用标记与来源无关。 */
export const packageEntrySchema = z.strictObject({
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("path"), path: z.string().min(1) }),
    z.strictObject({ kind: z.literal("npm"), name: z.string().min(1), version: z.string().min(1) }),
  ]),
  enabled: z.boolean(),
});
export type PackageEntry = z.infer<typeof packageEntrySchema>;
const listSchema = z.strictObject({ version: z.literal(1), packages: z.array(packageEntrySchema) });

export class PluginPackageError extends Error {
  constructor(readonly code: "not_a_package" | "invalid_manifest" | "incompatible_api" | "duplicate" | "build_failed" | "invalid_entry", message: string) { super(message); }
}

/** 来源 adapter：只给出包根，之后的流程不再区分来源。 */
export function packageRoot(entry: PackageEntry, npmRoot: string): string {
  return entry.source.kind === "path" ? resolve(entry.source.path) : join(npmRoot, "node_modules", entry.source.name);
}

/** 读取并校验包根的清单；路径必须是包根，不向下搜索。 */
export function readManifest(root: string): PluginPackageManifest {
  const file = join(root, "package.json");
  if (!existsSync(file)) throw new PluginPackageError("not_a_package", `No package.json at ${root}.`);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new PluginPackageError("invalid_manifest", `package.json at ${root} is not valid JSON.`); }
  const parsed = manifestSchema.safeParse((raw as { atelier?: unknown } | null)?.atelier);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(issue => `atelier.${issue.path.join(".") || "(root)"}`).join(", ");
    throw new PluginPackageError("invalid_manifest", `Package at ${root} has no valid Atelier manifest: ${fields}.`);
  }
  const manifest = parsed.data;
  if (manifest.api.major !== sdkApi.major || manifest.api.minMinor > sdkApi.minor) {
    throw new PluginPackageError("incompatible_api", `Plugin ${manifest.id} requires SDK API ${manifest.api.major}.${manifest.api.minMinor}; host provides ${sdkApi.major}.${sdkApi.minor}.`);
  }
  for (const entry of [manifest.runtime, manifest.renderer]) {
    if (entry && relative(root, resolve(root, entry)).startsWith("..")) throw new PluginPackageError("invalid_entry", `Entry ${entry} is outside the package.`);
  }
  return manifest;
}

/** 包列表持久化：`<data>/plugins.json`；变化在重启后生效。 */
export class PackageList {
  constructor(private readonly file: string) {}
  read(): PackageEntry[] {
    if (!existsSync(this.file)) return [];
    return listSchema.parse(JSON.parse(readFileSync(this.file, "utf8"))).packages;
  }
  private write(packages: PackageEntry[]): void {
    mkdirSync(join(this.file, ".."), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, packages }, null, 2), { flush: true });
    renameSync(temporary, this.file);
  }
  /** 添加即校验：无效包直接失败，不留条目；新添加默认启用。 */
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
 * 宿主共享模块：这些导入转发到已加载实例；
 * 插件公共模块及其他依赖由 package-modules 构建为 ESM 图。
 */
const shared: Record<string, Record<string, unknown>> = {
  zod: zod as Record<string, unknown>,
  "@atelier/sdk/contracts": sdkContracts as Record<string, unknown>,
  "@atelier/sdk/runtime": sdkRuntime as Record<string, unknown>,
};
const sharedGlobal = "__atelierSharedModules";
(globalThis as Record<string, unknown>)[sharedGlobal] = shared;
function sharedModuleSource(id: string): string {
  const names = Object.keys(shared[id]!).filter(name => name !== "default" && /^[A-Za-z_$][\w$]*$/u.test(name));
  return [`const m = globalThis[${JSON.stringify(sharedGlobal)}][${JSON.stringify(id)}];`,
    `export default m.default ?? m;`, ...names.map((name, index) =>
      `const shared${index} = m[${JSON.stringify(name)}]; export { shared${index} as ${name} };`)].join("\n");
}

/** renderer 共享模块：由宿主页面在 window.__atelierRendererModules 提供同一实例。 */
export const rendererShared: readonly string[] = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-intl", "zod", "@atelier/sdk/contracts", "@atelier/sdk/renderer"];
function rendererModuleSource(id: string): string {
  // CJS 形态转发：esbuild 的互操作让具名导入按属性读取同一实例。
  return `const m = globalThis.__atelierRendererModules[${JSON.stringify(id)}]; module.exports = m;`;
}

/** 宿主库保留既有实例；插件公共模块通过同一 ESM 图共享。 */
function hostModules(realm: "runtime" | "renderer"): Plugin {
  return { name: "atelier-host-modules", setup(build) {
    build.onResolve({ filter: /.*/ }, args => (realm === "runtime" ? args.path in shared : rendererShared.includes(args.path))
      ? { path: args.path, namespace: "atelier-host" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "atelier-host" }, args => ({
      contents: realm === "runtime" ? sharedModuleSource(args.path) : rendererModuleSource(args.path), loader: "js",
    }));
  } };
}

export interface ResolvedPackage {
  dependencies?: string[];
  rendererDependencies?: string[];
  catalogs?: TranslationCatalog[];
  entry: PackageEntry;
  root: string;
  manifest: PluginPackageManifest | null;
  status: "loaded" | "disabled" | "invalid" | "failed";
  error?: string;
  definition?: PluginDefinition;
  /** 相对 renderer 缓存根的入口路径。 */
  renderer?: string;
}

/** 读取列表、校验清单与冲突、打包并导入启用的插件；失败传播给依赖方。 */
export async function loadPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[], publicProviders: readonly PublicProvider[] = []): Promise<ResolvedPackage[]> {
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
  const compiled = await compileModules(modules, new Set(result.filter(item => item.status === "loaded").map(item => item.manifest!.id)), cacheRoot, hostModules, publicProviders);
  for (const item of result) {
    if (item.status !== "loaded") continue;
    const id = item.manifest!.id;
    item.dependencies = [...compiled.dependencies.get(id) ?? []];
    item.rendererDependencies = [...compiled.rendererDependencies.get(id) ?? []];
    try {
      if (compiled.failures.has(id)) throw new PluginPackageError("build_failed", compiled.failures.get(id)!);
      const renderer = compiled.renderer.get(id);
      if (renderer) item.renderer = relative(cacheRoot, renderer).split("\\").join("/");
      const file = compiled.runtime.get(id);
      if (!file) continue;
      const module = await import(pathToFileURL(file).href) as { default?: unknown };
      const definition = module.default as PluginDefinition | undefined;
      if (!definition || typeof definition !== "object" || definition.namespace?.id !== id
        || typeof definition.version !== "string" || !definition.version.trim()
        || (definition.setup !== undefined && typeof definition.setup !== "function")
        || (definition.modules !== undefined && (!Array.isArray(definition.modules) || definition.modules.some(module => !module || typeof module.setup !== "function"))))
        throw new PluginPackageError("invalid_entry", `Runtime entry of ${id} must default-export definePlugin(...) with namespace ${id}.`);
      item.definition = definition;
    } catch (error) {
      item.status = "failed"; item.error = error instanceof Error ? error.message : String(error);
    }
  }
  // 导入失败同样传播给依赖方；不让消费者拿着失败提供方的公共服务进入 setup。
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of result) if (item.status === "loaded") {
      const failed = [...compiled.dependencies.get(item.manifest!.id) ?? []].find(id => result.some(provider => provider.manifest?.id === id && provider.status !== "loaded"));
      if (failed) {
        item.status = "failed"; item.error = `Public dependency ${failed} is unavailable.`;
        delete item.definition; delete item.renderer; changed = true;
      }
    }
  }
  // 纯公共包没有 setup；穿透其依赖，使真正的服务提供方先初始化。
  const dependenciesOf = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    return [...compiled.runtimeDependencies.get(id) ?? []].flatMap(dependency =>
      publicProviders.some(provider => provider.pluginId === dependency) || result.some(item => item.manifest?.id === dependency && item.definition)
        ? [dependency] : dependenciesOf(dependency, visited));
  };
  for (const item of result) if (item.definition) item.definition = { ...item.definition, dependencies: dependenciesOf(item.manifest!.id) };
  for (const item of result) if (item.status === "loaded" && item.manifest?.i18n)
    item.catalogs = loadCatalogs(item.root, item.manifest.id, item.manifest.i18n.catalogs);
  return result;
}
