import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import * as zod from "zod";
import * as sdkContracts from "@atelier/sdk/contracts";
import * as sdkRuntime from "@atelier/sdk/runtime";
import type { PluginDefinition } from "./contract.ts";

/** SDK 主版本；插件清单的 api.major 必须相同，minMinor 不得高于宿主。 */
export const sdkApi = { major: 1, minor: 0 } as const;

/** 插件包清单：package.json 的 atelier 字段；源码与发布产物读同一份。 */
export const manifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u),
  api: z.strictObject({ major: z.number().int().nonnegative(), minMinor: z.number().int().nonnegative() }),
  runtime: z.string().min(1).optional(),
  renderer: z.string().min(1).optional(),
});
export type PluginPackageManifest = z.infer<typeof manifestSchema>;

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
 * 共享模块白名单：插件 bundle 中这些导入解析到宿主已加载的同一实例，
 * 其余依赖由 esbuild 从包目录解析并打进 bundle。
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
    `export default m.default ?? m;`, ...names.map(name => `export const ${name} = m[${JSON.stringify(name)}];`)].join("\n");
}

/** 内容哈希：源码文件（跳过 node_modules 与 .git）、lockfile 与宿主 SDK 版本。 */
function sourceHash(root: string, compiler: string): string {
  const hash = createHash("sha256").update(`${compiler}\0${sdkApi.major}.${sdkApi.minor}\0`);
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      if (name === "node_modules" || name === ".git") continue;
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else hash.update(relative(root, path)).update("\0").update(readFileSync(path)).update("\0");
    }
  };
  walk(root);
  return hash.digest("hex").slice(0, 32);
}

/** 启动时打包后台入口并按内容缓存；不监听文件，改动后重启生效。 */
export async function buildRuntime(root: string, manifest: PluginPackageManifest, cacheRoot: string): Promise<string> {
  if (!manifest.runtime) throw new PluginPackageError("invalid_entry", `Plugin ${manifest.id} has no runtime entry.`);
  const esbuild = await import("esbuild");
  const directory = join(cacheRoot, manifest.id, sourceHash(root, esbuild.version));
  const outfile = join(directory, "runtime.mjs");
  if (existsSync(outfile)) return outfile;
  mkdirSync(directory, { recursive: true });
  try {
    await esbuild.build({
      entryPoints: [resolve(root, manifest.runtime)], absWorkingDir: root, outfile, bundle: true,
      platform: "node", format: "esm", target: "node22", sourcemap: "linked", logLevel: "silent",
      // Node 内置与原生 addon 保持外部；原生 addon 需作者自行按 Electron ABI 编译。
      external: ["*.node"], packages: undefined,
      banner: { js: "import { createRequire as __atelierCreateRequire } from 'node:module'; const require = __atelierCreateRequire(import.meta.url);" },
      plugins: [{
        name: "atelier-shared",
        setup(build) {
          build.onResolve({ filter: /.*/ }, args => args.path in shared ? { path: args.path, namespace: "atelier-shared" } : undefined);
          build.onLoad({ filter: /.*/, namespace: "atelier-shared" }, args => ({ contents: sharedModuleSource(args.path), loader: "js" }));
        },
      }],
    });
  } catch (error) {
    throw new PluginPackageError("build_failed", `Plugin ${manifest.id} failed to build: ${error instanceof Error ? error.message : String(error)}`);
  }
  return outfile;
}

export interface ResolvedPackage {
  entry: PackageEntry;
  root: string;
  manifest: PluginPackageManifest | null;
  status: "loaded" | "disabled" | "invalid" | "failed";
  error?: string;
  definition?: PluginDefinition;
}

/** 读取列表、校验清单与冲突、打包并导入启用的插件；单个失败只禁用该包。 */
export async function loadPackages(list: PackageList, npmRoot: string, cacheRoot: string, reserved: readonly string[]): Promise<ResolvedPackage[]> {
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
  for (const item of result) {
    if (item.status !== "loaded" || !item.manifest) continue;
    const id = item.manifest.id;
    try {
      if (reserved.includes(id)) throw new PluginPackageError("duplicate", `Plugin ID ${id} is reserved by a built-in plugin.`);
      if ((ids.get(id) ?? 0) > 1) throw new PluginPackageError("duplicate", `Plugin ${id} is added more than once; disable one of them.`);
      if (!item.manifest.runtime) continue;
      const file = await buildRuntime(item.root, item.manifest, cacheRoot);
      const module = await import(pathToFileURL(file).href) as { default?: unknown };
      const definition = module.default as PluginDefinition | undefined;
      if (!definition || typeof definition !== "object" || !Array.isArray(definition.modules) || definition.namespace?.id !== id) {
        throw new PluginPackageError("invalid_entry", `Runtime entry of ${id} must default-export definePlugin(...) with namespace ${id}.`);
      }
      item.definition = definition;
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
    }
  }
  return result;
}
