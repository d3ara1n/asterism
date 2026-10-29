import { pathWithin } from "../storage/paths.ts";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuildOptions, Plugin } from "esbuild";
import { publicModuleSource, type PublicProvider, type ModuleRealm } from "../shared/public-modules.ts";
import { assertRuntimeModules } from "../shared/runtime-modules.ts";

/** Package public entry is standard exports["./public"]; types and runtime share ordinary package imports. */
export interface PackageModule {
  id: string;
  name: string;
  root: string;
  public: boolean;
  publicPackages?: readonly string[];
  runtimeExternals?: readonly string[];
  runtime?: string;
  renderer?: string;
  /** Storage declaration entry; shares the backend runtime build without depending on the plugin runtime. */
  storage?: string;
}
export function packageModule(root: string, entry: { id: string; runtime?: string; renderer?: string; storage?: string; publicPackages?: readonly string[]; runtimeExternals?: readonly string[] }): PackageModule {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const exported = pkg.exports && typeof pkg.exports === "object" && "./public" in pkg.exports;
  if (exported && (typeof pkg.name !== "string" || !/^(?:@[^/\s]+\/)?[^/\s]+$/u.test(pkg.name)))
    throw new Error(`Plugin ${entry.id} must declare a package name for its public export.`);
  return { ...entry, root: realpathSync(root), name: typeof pkg.name === "string" ? pkg.name : "", public: Boolean(exported) };
}
export interface CompiledModules {
  runtime: Map<string, string>;
  storage: Map<string, string>;
  renderer: Map<string, string>;
  stylesheets: Map<string, string>;
  dependencies: Map<string, Set<string>>;
  runtimeDependencies: Map<string, Set<string>>;
  rendererDependencies: Map<string, Set<string>>;
  failures: Map<string, string>;
}

/** Rewrite archive segment `<name>.asar` to Forge's unpacked physical directory `<name>.asar.unpacked`; return null outside archives. */
export function unpackedArchivePath(entry: string): string | null {
  const segments = entry.split(/[\\/]/u);
  let archive = -1;
  for (let index = 0; index < segments.length; index += 1) if (segments[index]!.endsWith(".asar")) archive = index;
  if (archive < 0) return null;
  const separator = entry.match(/[\\/]/u)?.[0] ?? "/";
  return [...segments.slice(0, archive), `${segments[archive]}.unpacked`, ...segments.slice(archive + 1)].join(separator);
}
/** Directory shipped with the application, relative to the repository root; packaged builds read its unpacked copy. */
export function applicationDirectory(path: string): string {
  const directory = fileURLToPath(new URL(`../../${path}/`, import.meta.url));
  return unpackedArchivePath(directory) ?? directory;
}

/** Storage and backend entries share a runtime build; plugin IDs contain no `@`, so output names cannot conflict. */
const storageEntry = (id: string) => `${id}@storage`;
function realmEntries(realm: ModuleRealm, pkg: PackageModule): [string, string][] {
  if (realm === "renderer") return pkg.renderer ? [[pkg.id, resolve(pkg.root, pkg.renderer)]] : [];
  return [...pkg.runtime ? [[pkg.id, resolve(pkg.root, pkg.runtime)] as [string, string]] : [],
    ...pkg.storage ? [[storageEntry(pkg.id), resolve(pkg.root, pkg.storage)] as [string, string]] : []];
}

/**
 * Packaged esbuild JS entries live inside asar archives; Electron patches archives only for fs, while spawn does not rewrite executable paths,
 * so the esbuild service fails with ENOTDIR. Forge unpacks esbuild and platform packages in full; load from physical paths instead,
 * letting esbuild resolve platform binaries itself. Development without archive segments retains ordinary package imports.
 */
async function loadEsbuild(): Promise<typeof import("esbuild")> {
  const nodeRequire = createRequire(import.meta.url);
  const unpacked = unpackedArchivePath(nodeRequire.resolve("esbuild"));
  if (unpacked === null) return import("esbuild");
  if (!existsSync(unpacked)) throw new Error(`esbuild is not unpacked next to the asar archive: ${unpacked} is missing.`);
  const loaded: typeof import("esbuild") | { default: typeof import("esbuild") } = await import(pathToFileURL(unpacked).href);
  return "build" in loaded ? loaded : loaded.default;
}
/** Build the complete module graph for one runtime environment at once; shared ESM chunks preserve object identity and live bindings. */
export async function compileModules(packages: readonly PackageModule[], enabled: ReadonlySet<string>, cacheRoot: string,
  hostModule: (realm: ModuleRealm) => Plugin, publicProviders: readonly PublicProvider[] = [],
  progress: (id: string) => void = () => {}): Promise<CompiledModules> {
  const preloaded = new Map<string, PublicProvider>();
  for (const provider of publicProviders) {
    if (preloaded.has(provider.name))
      throw new Error(`Duplicate public provider: ${provider.name}.`);
    preloaded.set(provider.name, provider);
  }
  const result: CompiledModules = { runtime: new Map(), storage: new Map(), renderer: new Map(), stylesheets: new Map(), dependencies: new Map(), runtimeDependencies: new Map(), rendererDependencies: new Map(), failures: new Map() };
  if (!packages.some(pkg => enabled.has(pkg.id))) return result;
  const esbuild = await loadEsbuild();
  try {
    const providers = new Map<string, PackageModule>();
    const libraries = new Map<string, PackageModule>();
    for (const pkg of packages.filter(pkg => enabled.has(pkg.id))) {
      if (preloaded.has(pkg.name)) {
        result.failures.set(pkg.id, `Public package ${pkg.name} is already provided by the application.`);
        continue;
      }
      for (const name of pkg.publicPackages ?? []) {
        const previous = libraries.get(name);
        if (previous && previous.id !== pkg.id || preloaded.has(name)) {
          const error = `Multiple plugins provide public package ${name}.`;
          result.failures.set(pkg.id, error);
          if (previous) result.failures.set(previous.id, error);
        } else libraries.set(name, pkg);
      }
      if (!pkg.public) continue;
      const previous = providers.get(pkg.name);
      if (previous) {
        const error = `Multiple enabled plugins provide ${pkg.name}/public: ${previous.id}, ${pkg.id}.`;
        result.failures.set(previous.id, error); result.failures.set(pkg.id, error);
      } else providers.set(pkg.name, pkg);
    }
    for (const [name, library] of libraries) {
      const provider = providers.get(name);
      if (provider && provider.id !== library.id) {
        const error = `Multiple plugins provide public package ${name}: ${library.id}, ${provider.id}.`;
        result.failures.set(library.id, error);
        result.failures.set(provider.id, error);
      }
    }
    const roots = [...packages].sort((a, b) => b.root.length - a.root.length);
    const pluginOwner = (path: string) => roots.find(pkg => pathWithin(pkg.root, path) !== null);
    const resolver = (realm: ModuleRealm, entry?: PackageModule): Plugin => ({ name: "asterism-public-modules", setup(build) {
      const depend = (source: PackageModule | undefined, provider: string) => {
        for (const consumer of [source, entry]) if (consumer && consumer.id !== provider) {
          for (const map of [result.dependencies, realm === "runtime" ? result.runtimeDependencies : result.rendererDependencies]) {
            const dependencies = map.get(consumer.id) ?? new Set<string>();
            dependencies.add(provider); map.set(consumer.id, dependencies);
          }
        }
      };
      build.onLoad({ filter: /.*/, namespace: "asterism-public" }, args => {
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
          depend(source, loaded.pluginId);
          return { path: args.path, namespace: "asterism-public" };
        }
        const library = libraries.get(name) ?? (!providers.has(name) ? packages.find(pkg => pkg.publicPackages?.includes(name)) : undefined);
        if (library) {
          if (!enabled.has(library.id) || result.failures.has(library.id))
            return { errors: [{ text: `Public package ${name} has no available enabled provider.` }] };
          depend(source, library.id);
          return build.resolve(args.path, { kind: args.kind, resolveDir: library.root, pluginData: { publicResolution: true } });
        }
        if (realm === "runtime" && packages.some(pkg => enabled.has(pkg.id) && pkg.runtimeExternals?.includes(name))) {
          const resolved = await build.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, pluginData: { publicResolution: true } });
          if (resolved.errors.length) return resolved;
          const path = unpackedArchivePath(resolved.path) ?? resolved.path;
          return { path: pathToFileURL(path).href, external: true };
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
        // Preflight entries also retain indirect dependencies: symlinks/shared helpers may live outside every plugin root.
        depend(source, provider.id);
        // Resolve under the provider's own package exports rather than another copy in consumer-private node_modules.
        return build.resolve(args.path, { kind: args.kind, resolveDir: provider.root, pluginData: { publicResolution: true } });
      });
    } });
    const options = (realm: ModuleRealm, entries: readonly PackageModule[]): BuildOptions => ({
      entryPoints: Object.fromEntries(entries.flatMap(pkg => realmEntries(realm, pkg))),
      outdir: resolve(cacheRoot, "build", realm), entryNames: "[name]", chunkNames: "chunks/[name]-[hash]", assetNames: "assets/[name]-[hash]",
      outExtension: { ".js": ".mjs" }, bundle: true, splitting: true, format: "esm", write: false,
      platform: realm === "runtime" ? "node" : "browser", target: realm === "runtime" ? "node22" : "chrome130",
      logLevel: "silent", sourcemap: "linked", metafile: true,
      ...(realm === "runtime" ? { external: ["*.node"], banner: { js: "import { createRequire as __asterismCreateRequire } from 'node:module'; const require = __asterismCreateRequire(import.meta.url);" } }
        : { jsx: "automatic", loader: {
          ".png": "file", ".jpg": "file", ".jpeg": "file", ".gif": "file", ".webp": "file", ".avif": "file", ".svg": "file", ".ico": "file",
          ".woff": "file", ".woff2": "file", ".ttf": "file", ".otf": "file", ".eot": "file",
          ".wasm": "file", ".mp3": "file", ".ogg": "file",
        } }),
      plugins: [{ name: "asterism-runtime-inputs", setup(build) {
        build.onEnd(result => {
          if (result.metafile) {
            const inputs = Object.keys(result.metafile.inputs);
            assertRuntimeModules(inputs);
          }
        });
      } }, hostModule(realm), resolver(realm, entries.length === 1 ? entries[0] : undefined)],
    });
    const active = packages.filter(pkg => enabled.has(pkg.id));
    // Independent preflights isolate broken plugins; build together afterward without using preflight artifacts as independent bundles.
    for (const pkg of active) {
      if (result.failures.has(pkg.id)) continue;
      progress(pkg.id);
      try {
        for (const realm of ["runtime", "renderer"] as const) if (realmEntries(realm, pkg).length) await esbuild.build(options(realm, [pkg]));
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
    const compile = async (realm: ModuleRealm, component: readonly PackageModule[]) => {
      if (!component.some(pkg => realmEntries(realm, pkg).length)) return;
      progress(component.map(pkg => pkg.id).join(", "));
      try {
        const built = await esbuild.build(options(realm, component));
        const base = resolve(cacheRoot, "build", realm);
        const hash = createHash("sha256");
        for (const file of built.outputFiles!) hash.update(relative(base, file.path)).update(file.contents);
        const directory = join(cacheRoot, `modules-${hash.digest("hex").slice(0, 32)}`, realm);
        for (const file of built.outputFiles!) {
          const destination = join(directory, relative(base, file.path));
          mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, file.contents);
        }
        const outputMetadata = new Map(Object.entries(built.metafile!.outputs).map(([file, output]) => [resolve(file), output]));
        for (const pkg of component) {
          if (realm === "renderer") {
            if (pkg.renderer) {
              result.renderer.set(pkg.id, join(directory, `${pkg.id}.mjs`));
              const output = outputMetadata.get(resolve(base, `${pkg.id}.mjs`));
              if (output?.cssBundle) result.stylesheets.set(pkg.id, join(directory, relative(base, resolve(output.cssBundle))));
            }
            continue;
          }
          if (pkg.runtime) result.runtime.set(pkg.id, join(directory, `${pkg.id}.mjs`));
          if (pkg.storage) result.storage.set(pkg.id, join(directory, `${storageEntry(pkg.id)}.mjs`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const pkg of component) {
          result.failures.set(pkg.id, realm === "renderer" ? `Shared renderer build failed: ${message}` : message);
          result.runtime.delete(pkg.id); result.storage.delete(pkg.id); result.renderer.delete(pkg.id); result.stylesheets.delete(pkg.id);
        }
      }
    };
    // Group backend builds by public dependencies; preflight already excludes broken plugins and their consumers.
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
      await compile("runtime", ready.filter(pkg => ids.has(pkg.id)));
    }
    // Frontend modules share a document class namespace; unified builds avoid CSS Module collisions even without dependency relationships.
    await compile("renderer", ready.filter(pkg => pkg.renderer && !result.failures.has(pkg.id)));
    return result;
  } finally {
    // Each build batch owns the esbuild service and terminates its process on exceptions too.
    await esbuild.stop();
  }
}
