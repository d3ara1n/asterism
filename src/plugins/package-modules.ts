import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BuildOptions, Plugin } from "esbuild";
import { satisfies, valid, validRange } from "semver";
import { publicModuleSource, type PublicProvider, type ModuleRealm } from "../shared/public-modules.ts";
import { PluginBuildCache } from "./build-cache.ts";

/** 包公共入口是标准 exports["./public"]；类型与运行时共用正常包导入。 */
interface PackageDependencyOwner {
  name: string;
  dependencies: ReadonlyMap<string, readonly string[]>;
}
export interface PackageModule extends PackageDependencyOwner {
  id: string;
  root: string;
  public: boolean;
  runtime?: string;
  renderer?: string;
}
interface DependencyManifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
function dependencyRanges(pkg: DependencyManifest): Map<string, readonly string[]> {
  return new Map([...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})])]
    .map(name => [name, [pkg.dependencies?.[name], pkg.peerDependencies?.[name], pkg.optionalDependencies?.[name]].filter(value => value !== undefined)]));
}
export function packageModule(root: string, entry: { id: string; runtime?: string; renderer?: string }): PackageModule {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const exported = pkg.exports && typeof pkg.exports === "object" && "./public" in pkg.exports;
  if (exported && (typeof pkg.name !== "string" || !/^(?:@[^/\s]+\/)?[^/\s]+$/u.test(pkg.name)))
    throw new Error(`Plugin ${entry.id} must declare a package name for its public export.`);
  return { ...entry, root: realpathSync(root), name: typeof pkg.name === "string" ? pkg.name : "", public: Boolean(exported),
    dependencies: dependencyRanges(pkg) };
}
/** 代码依赖按最近的 npm 包声明查找；生命周期仍绑定承载它的插件。 */
function createDependencyOwnerLookup() {
  const npmOwners = new Map<string, PackageDependencyOwner | null>();
  return (importer: string): PackageDependencyOwner | null => {
    let directory = dirname(importer);
    const visited: string[] = [];
    let found: PackageDependencyOwner | null = null;
    while (true) {
      if (npmOwners.has(directory)) { found = npmOwners.get(directory)!; break; }
      visited.push(directory);
      const manifest = join(directory, "package.json");
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        found = { name: typeof pkg.name === "string" ? pkg.name : directory, dependencies: dependencyRanges(pkg) };
        break;
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    for (const directory of visited) npmOwners.set(directory, found);
    return found;
  };
}
export interface CompiledModules {
  runtime: Map<string, string>;
  renderer: Map<string, string>;
  dependencies: Map<string, Set<string>>;
  runtimeDependencies: Map<string, Set<string>>;
  rendererDependencies: Map<string, Set<string>>;
  failures: Map<string, string>;
}

/** 归档段 `<name>.asar` 改写为 Forge 解包出的实体目录 `<name>.asar.unpacked`；路径不在归档内时返回 null。 */
export function unpackedArchivePath(entry: string): string | null {
  const segments = entry.split(/[\\/]/u);
  let archive = -1;
  for (let index = 0; index < segments.length; index += 1) if (segments[index]!.endsWith(".asar")) archive = index;
  if (archive < 0) return null;
  const separator = entry.match(/[\\/]/u)?.[0] ?? "/";
  return [...segments.slice(0, archive), `${segments[archive]}.unpacked`, ...segments.slice(archive + 1)].join(separator);
}

/**
 * 打包后 esbuild 的 JS 入口位于 asar 归档内；Electron 只为 fs 提供归档补丁，spawn 不改写可执行路径，
 * esbuild 服务进程会以 ENOTDIR 失败。Forge 已把 esbuild 与平台包整体解包，改从实体路径加载，
 * 平台二进制由 esbuild 自行解析；开发环境（无归档段）保持正常包导入。
 */
async function loadEsbuild(): Promise<typeof import("esbuild")> {
  const nodeRequire = createRequire(import.meta.url);
  const unpacked = unpackedArchivePath(nodeRequire.resolve("esbuild"));
  if (unpacked === null) return import("esbuild");
  if (!existsSync(unpacked)) throw new Error(`esbuild is not unpacked next to the asar archive: ${unpacked} is missing.`);
  const loaded: typeof import("esbuild") | { default: typeof import("esbuild") } = await import(pathToFileURL(unpacked).href);
  return "build" in loaded ? loaded : loaded.default;
}
/** 一次构建一个运行环境的完整模块图，ESM 共享 chunk 保留对象身份与 live binding。 */
export async function compileModules(packages: readonly PackageModule[], enabled: ReadonlySet<string>, cacheRoot: string,
  hostModule: (realm: ModuleRealm) => Plugin, publicProviders: readonly PublicProvider[] = [], hostIdentity = "",
  progress: (id: string) => void = () => {}): Promise<CompiledModules> {
  const preloaded = new Map<string, PublicProvider>();
  for (const provider of publicProviders) {
    if (preloaded.has(provider.name) || !valid(provider.version))
      throw new Error(`Invalid or duplicate public provider: ${provider.name}@${provider.version}.`);
    preloaded.set(provider.name, provider);
  }
  const result: CompiledModules = { runtime: new Map(), renderer: new Map(), dependencies: new Map(), runtimeDependencies: new Map(), rendererDependencies: new Map(), failures: new Map() };
  if (!packages.some(pkg => enabled.has(pkg.id))) return result;
  const cache = new PluginBuildCache(cacheRoot, packages.filter(pkg => enabled.has(pkg.id)).map(pkg => pkg.root), {
    // 构建选项、解析器或宿主转接规则变化时递增配方版本。
    recipe: 1, esbuild: createRequire(import.meta.url)("esbuild/package.json").version, platform: process.platform, arch: process.arch,
    cwd: process.cwd(), nodePath: process.env.NODE_PATH,
    packages: packages.map(pkg => ({ ...pkg, dependencies: [...pkg.dependencies] })), enabled: [...enabled], publicProviders, hostIdentity,
  });
  const cached = cache.read();
  if (cached) { console.info("Plugin build cache hit."); return cached; }
  console.info("Plugin build cache miss; compiling plugin modules.");
  const esbuild = await loadEsbuild();
  const outputFiles: string[] = [];
  try {
    const providers = new Map<string, PackageModule>();
    for (const pkg of packages.filter(pkg => enabled.has(pkg.id))) {
      if (preloaded.has(pkg.name)) {
        result.failures.set(pkg.id, `Public package ${pkg.name} is already provided by the application.`);
        continue;
      }
      if (!pkg.public) continue;
      const previous = providers.get(pkg.name);
      if (previous) {
        const error = `Multiple enabled plugins provide ${pkg.name}/public: ${previous.id}, ${pkg.id}.`;
        result.failures.set(previous.id, error); result.failures.set(pkg.id, error);
      } else providers.set(pkg.name, pkg);
    }
    const roots = [...packages].sort((a, b) => b.root.length - a.root.length);
    const pluginOwner = (path: string) => roots.find(pkg => { const r = relative(pkg.root, path); return r === "" || (!r.startsWith("..") && !r.startsWith("/")); });
    const npmOwner = createDependencyOwnerLookup();
    const resolver = (realm: ModuleRealm, entry?: PackageModule): Plugin => ({ name: "atelier-public-modules", setup(build) {
      const depend = (source: PackageModule | undefined, provider: string) => {
        for (const consumer of [source, entry]) if (consumer && consumer.id !== provider) {
          for (const map of [result.dependencies, realm === "runtime" ? result.runtimeDependencies : result.rendererDependencies]) {
            const dependencies = map.get(consumer.id) ?? new Set<string>();
            dependencies.add(provider); map.set(consumer.id, dependencies);
          }
        }
      };
      build.onLoad({ filter: /.*/, namespace: "atelier-public" }, args => {
        const provider = publicProviders.find(provider => Object.hasOwn(provider.modules[realm] ?? {}, args.path))!;
        return { contents: publicModuleSource(provider, realm, args.path), loader: "js" };
      });
      build.onResolve({ filter: /.*/ }, async args => {
        if (args.pluginData?.publicResolution) return;
        const match = /^(?<name>@[^/]+\/[^/]+|[^./][^/]*)(?<subpath>\/.*)?$/u.exec(args.path);
        if (!match) return;
        const name = match.groups!.name!, subpath = match.groups!.subpath ?? "";
        const source = pluginOwner(args.importer || args.resolveDir);
        const loaded = preloaded.get(name);
        if (loaded) {
          if (!Object.hasOwn(loaded.modules[realm] ?? {}, args.path))
            return { errors: [{ text: `Public module ${args.path} is not exported in ${realm}.` }] };
          // 独立 npm 库使用自己的依赖；无包归属的 helper 回退到承载插件。
          const consumer = npmOwner(args.importer) ?? source ?? entry;
          if (consumer) {
            const ranges = consumer.dependencies.get(name);
            if (!ranges?.length)
              return { errors: [{ text: `Package ${consumer.name} must declare a dependency on ${name}.` }] };
            if (ranges.some(range => typeof range !== "string" || !validRange(range) || !satisfies(loaded.version, range)))
              return { errors: [{ text: `Package ${consumer.name} requires ${name} ${ranges.join(" and ")}; application provides ${loaded.version}.` }] };
          }
          depend(source, loaded.pluginId);
          return { path: args.path, namespace: "atelier-public" };
        }
        if (source?.name === name && subpath !== "/public") return;
        const candidate = providers.get(name) ?? packages.find(pkg => pkg.name === name && pkg.public);
        if (!candidate) return subpath === "/public"
          ? { errors: [{ text: `Public module ${args.path} has no registered provider.` }] } : undefined;
        if (source?.id !== candidate.id && subpath !== "/public")
          return { errors: [{ text: `Plugin imports must use ${name}/public, not ${args.path}.` }] };
        if (subpath !== "/public") return;
        const provider = providers.get(name);
        if (!provider || result.failures.has(provider.id)) return { errors: [{ text: `Public module ${name}/public has no available enabled provider.` }] };
        if (source && source.id !== provider.id && !source.dependencies.has(name))
          return { errors: [{ text: `Plugin ${source.id} must declare a dependency on ${name}.` }] };
        // 预检入口也持有间接依赖：symlink／共享 helper 可以位于所有插件根目录之外。
        depend(source, provider.id);
        // 在提供方自身的 package exports 下解析，不能从消费者私有 node_modules 取另一份。
        return build.resolve(args.path, { kind: args.kind, resolveDir: provider.root, pluginData: { publicResolution: true } });
      });
    } });
    const options = (realm: ModuleRealm, entries: readonly PackageModule[]): BuildOptions => ({
      entryPoints: Object.fromEntries(entries.filter(pkg => pkg[realm]).map(pkg => [pkg.id, resolve(pkg.root, pkg[realm]!)])),
      outdir: resolve(cacheRoot, "build", realm), entryNames: "[name]", chunkNames: "chunks/[name]-[hash]", assetNames: "assets/[name]-[hash]",
      outExtension: { ".js": ".mjs" }, bundle: true, splitting: true, format: "esm", write: false,
      platform: realm === "runtime" ? "node" : "browser", target: realm === "runtime" ? "node22" : "chrome130",
      logLevel: "silent", sourcemap: "linked", metafile: true,
      ...(realm === "runtime" ? { external: ["*.node"], banner: { js: "import { createRequire as __atelierCreateRequire } from 'node:module'; const require = __atelierCreateRequire(import.meta.url);" } }
        : { jsx: "automatic", loader: { ".png": "file", ".jpg": "file", ".svg": "file", ".wasm": "file", ".woff2": "file", ".mp3": "file", ".ogg": "file" } }),
      plugins: [{ name: "atelier-cache-inputs", setup(build) {
        build.onResolve({ filter: /.*/ }, args => { cache.resolution(args.path, args.importer, args.resolveDir); });
        build.onEnd(result => { if (result.metafile) cache.inputs(Object.keys(result.metafile.inputs)); });
      } }, hostModule(realm), resolver(realm, entries.length === 1 ? entries[0] : undefined)],
    });
    const active = packages.filter(pkg => enabled.has(pkg.id));
    // 独立预检隔离损坏插件；最终统一构建，不能使用预检产物作为各自独立的 bundle。
    for (const pkg of active) {
      if (result.failures.has(pkg.id)) continue;
      progress(pkg.id);
      try {
        for (const realm of ["runtime", "renderer"] as const) if (pkg[realm]) await esbuild.build(options(realm, [pkg]));
      } catch (error) { result.failures.set(pkg.id, error instanceof Error ? error.message : String(error)); }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const pkg of active) if (!result.failures.has(pkg.id)) {
        const failed = [...result.dependencies.get(pkg.id) ?? []].find(id => result.failures.has(id));
        if (failed) { result.failures.set(pkg.id, `Public dependency ${failed} failed to build.`); changed = true; }
      }
    }
    const ready = active.filter(pkg => !result.failures.has(pkg.id));
    // 公共依赖相连的入口必须一起构建；不相连的图分别失败，避免拖垮无关插件。
    const pending = new Set(ready.map(pkg => pkg.id));
    while (pending.size) {
      const ids = new Set<string>(), queue = [pending.values().next().value!];
      while (queue.length) {
        const id = queue.pop()!;
        if (!pending.delete(id)) continue;
        ids.add(id);
        queue.push(...result.dependencies.get(id) ?? [],
          ...ready.filter(pkg => result.dependencies.get(pkg.id)?.has(id)).map(pkg => pkg.id));
      }
      const component = ready.filter(pkg => ids.has(pkg.id));
      progress(component.map(pkg => pkg.id).join(", "));
      try {
        for (const realm of ["runtime", "renderer"] as const) {
          if (!component.some(pkg => pkg[realm])) continue;
          const built = await esbuild.build(options(realm, component));
          const base = resolve(cacheRoot, "build", realm);
          const hash = createHash("sha256");
          for (const file of built.outputFiles!) hash.update(relative(base, file.path)).update(file.contents);
          const directory = join(cacheRoot, `modules-${hash.digest("hex").slice(0, 32)}`, realm);
          for (const file of built.outputFiles!) {
            const destination = join(directory, relative(base, file.path));
            mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, file.contents);
            outputFiles.push(destination);
          }
          for (const pkg of component) if (pkg[realm]) result[realm].set(pkg.id, join(directory, `${pkg.id}.mjs`));
        }
      } catch (error) {
        for (const pkg of component) {
          result.failures.set(pkg.id, error instanceof Error ? error.message : String(error));
          result.runtime.delete(pkg.id); result.renderer.delete(pkg.id);
        }
      }
    }
    cache.write(result, outputFiles);
    return result;
  } finally {
    // 一个构建批次拥有 esbuild 服务，异常同样结束服务进程。
    await esbuild.stop();
  }
}
