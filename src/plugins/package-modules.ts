import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BuildOptions, Plugin } from "esbuild";

/** 包公共入口是标准 exports["./public"]；类型与运行时共用正常包导入。 */
export interface PackageModule {
  id: string;
  root: string;
  name: string;
  public: boolean;
  dependencies: ReadonlySet<string>;
  runtime?: string;
  renderer?: string;
}
export function packageModule(root: string, entry: { id: string; runtime?: string; renderer?: string }): PackageModule {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const exported = pkg.exports && typeof pkg.exports === "object" && "./public" in pkg.exports;
  if (exported && (typeof pkg.name !== "string" || !/^(?:@[^/\s]+\/)?[^/\s]+$/u.test(pkg.name)))
    throw new Error(`Plugin ${entry.id} must declare a package name for its public export.`);
  return { ...entry, root: realpathSync(root), name: typeof pkg.name === "string" ? pkg.name : "", public: Boolean(exported),
    dependencies: new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]) };
}
export interface CompiledModules {
  runtime: Map<string, string>;
  renderer: Map<string, string>;
  dependencies: Map<string, Set<string>>;
  runtimeDependencies: Map<string, Set<string>>;
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
  hostModule: (realm: "runtime" | "renderer") => Plugin): Promise<CompiledModules> {
  const esbuild = await loadEsbuild();
  const result: CompiledModules = { runtime: new Map(), renderer: new Map(), dependencies: new Map(), runtimeDependencies: new Map(), failures: new Map() };
  const providers = new Map<string, PackageModule>();
  for (const pkg of packages.filter(pkg => enabled.has(pkg.id) && pkg.public)) {
    const previous = providers.get(pkg.name);
    if (previous) {
      const error = `Multiple enabled plugins provide ${pkg.name}/public: ${previous.id}, ${pkg.id}.`;
      result.failures.set(previous.id, error); result.failures.set(pkg.id, error);
    } else providers.set(pkg.name, pkg);
  }
  const roots = [...packages].sort((a, b) => b.root.length - a.root.length);
  const owner = (path: string) => roots.find(pkg => { const r = relative(pkg.root, path); return r === "" || (!r.startsWith("..") && !r.startsWith("/")); });
  const resolver = (realm: "runtime" | "renderer", entry?: PackageModule): Plugin => ({ name: "atelier-public-modules", setup(build) {
    build.onResolve({ filter: /.*/ }, async args => {
      if (args.pluginData?.publicResolution) return;
      const match = /^(?<name>@[^/]+\/[^/]+|[^./][^/]*)(?<subpath>\/.*)?$/u.exec(args.path);
      if (!match) return;
      const name = match.groups!.name!, subpath = match.groups!.subpath ?? "";
      const source = owner(args.importer || args.resolveDir);
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
      for (const consumer of [source, entry]) if (consumer && consumer.id !== provider.id) {
        const dependencies = result.dependencies.get(consumer.id) ?? new Set<string>();
        dependencies.add(provider.id); result.dependencies.set(consumer.id, dependencies);
        if (realm === "runtime") {
          const runtime = result.runtimeDependencies.get(consumer.id) ?? new Set<string>();
          runtime.add(provider.id); result.runtimeDependencies.set(consumer.id, runtime);
        }
      }
      // 在提供方自身的 package exports 下解析，不能从消费者私有 node_modules 取另一份。
      return build.resolve(args.path, { kind: args.kind, resolveDir: provider.root, pluginData: { publicResolution: true } });
    });
  } });
  const options = (realm: "runtime" | "renderer", entries: readonly PackageModule[]): BuildOptions => ({
    entryPoints: Object.fromEntries(entries.filter(pkg => pkg[realm]).map(pkg => [pkg.id, resolve(pkg.root, pkg[realm]!)])),
    outdir: resolve(cacheRoot, "build", realm), entryNames: "[name]", chunkNames: "chunks/[name]-[hash]", assetNames: "assets/[name]-[hash]",
    outExtension: { ".js": ".mjs" }, bundle: true, splitting: true, format: "esm", write: false,
    platform: realm === "runtime" ? "node" : "browser", target: realm === "runtime" ? "node22" : "chrome130",
    logLevel: "silent", sourcemap: "linked",
    ...(realm === "runtime" ? { external: ["*.node"], banner: { js: "import { createRequire as __atelierCreateRequire } from 'node:module'; const require = __atelierCreateRequire(import.meta.url);" } }
      : { jsx: "automatic", loader: { ".png": "file", ".jpg": "file", ".svg": "file", ".wasm": "file", ".woff2": "file", ".mp3": "file", ".ogg": "file" } }),
    plugins: [hostModule(realm), resolver(realm, entries.length === 1 ? entries[0] : undefined)],
  });
  const active = packages.filter(pkg => enabled.has(pkg.id));
  // 独立预检隔离损坏插件；最终统一构建，不能使用预检产物作为各自独立的 bundle。
  for (const pkg of active) {
    if (result.failures.has(pkg.id)) continue;
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
  // esbuild 服务进程长驻；本函数是一个构建批次的唯一所有者，收束后停止，同进程下次构建按需重启。
  await esbuild.stop();
  return result;
}
