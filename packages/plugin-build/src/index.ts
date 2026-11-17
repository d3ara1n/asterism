import { realpathSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { build as esbuild } from "esbuild";
import { build as viteBuild, esmExternalRequirePlugin, type Plugin as VitePlugin } from "vite";
import { artifactSchema, pointerSchema, type ArtifactPointer, type PluginArtifact } from "./artifact.js";
import { manifestSchema, rendererExternals, isHostPackage, isSharedImport, matchesPackage, type BuildConfig, type Realm } from "./config.js";
import { rendererAssets } from "./renderer-assets.js";
import { assertRuntimeModules } from "./inputs.js";

export type { BuildConfig } from "./config.js";

export interface BuildPluginOptions {
  /** Package directory containing package.json, absolute or relative to the calling process directory. */
  root: string;
}
export interface BuildPluginResult {
  root: string;
  buildDirectory: string;
  pointerPath: string;
  pointer: ArtifactPointer;
  artifact: PluginArtifact;
}
const portable = (path: string) => path.replaceAll("\\", "/");
interface Entries { input: Record<string, string>; publicNames: Map<string, string> }
function entries(root: string, realm: Realm, config: BuildConfig): Entries {
  const input: Record<string, string> = {};
  if (config[realm]) input[realm] = realpathSync(resolve(root, config[realm]));
  if (realm === "runtime" && config.storage) input.storage = realpathSync(resolve(root, config.storage));
  const publicNames = new Map<string, string>();
  for (const [index, [specifier, source]] of Object.entries(config.public?.[realm] ?? {}).entries()) {
    const name = `public-${index}`;
    input[name] = realpathSync(resolve(root, source)); publicNames.set(specifier, name);
  }
  return { input, publicNames };
}

/** Build one package without reading application configuration or executing plugin entries. */
export async function buildPlugin({ root: requestedRoot }: BuildPluginOptions): Promise<BuildPluginResult> {
  const root = realpathSync(resolve(requestedRoot));
  const { asterism: manifest } = manifestSchema.parse(JSON.parse(await readFile(join(root, "package.json"), "utf8")));
  const config = manifest.build;
  for (const realm of ["runtime", "renderer"] as const) {
    for (const request of Object.keys(config.public?.[realm] ?? {})) {
      if (isHostPackage(request)) throw new Error(`Public entry ${request} is owned by the host in ${realm}`);
    }
  }
  const buildId = randomUUID();
  const pointerPath = join(root, manifest.artifact);
  const buildDirectory = join(dirname(pointerPath), "builds", buildId);
  await mkdir(buildDirectory, { recursive: true });
  const artifact: PluginArtifact = {
    format: 1, id: manifest.id, buildId, public: { runtime: {}, renderer: {} },
    imports: { runtime: [], renderer: [] }, runtimeExternals: [], stylesheets: [],
  };
  const runtime = entries(root, "runtime", config);
  if (Object.keys(runtime.input).length) {
    const owned = config.public?.runtime ?? {};
    const result = await esbuild({
      absWorkingDir: root, entryPoints: runtime.input, outdir: join(buildDirectory, "backend"),
      bundle: true, splitting: true, format: "esm", platform: "node", target: "node22",
      outExtension: { ".js": ".mjs" }, entryNames: "[name]", chunkNames: "chunks/[name]-[hash]",
      metafile: true, sourcemap: false, logLevel: "silent", jsx: "automatic",
      // CommonJS private dependencies retain Node's require conditions and native addon loading.
      banner: { js: 'import { createRequire as __asterismCreateRequire } from "node:module"; const require = __asterismCreateRequire(import.meta.url);' },
      plugins: [{ name: "asterism-runtime-boundaries", setup(build) {
        build.onResolve({ filter: /.*/ }, async args => {
          if (args.pluginData?.nativeResolution) return;
          if (Object.hasOwn(owned, args.path)) return { path: realpathSync(resolve(root, owned[args.path]!)) };
          if (isSharedImport("runtime", args.path, config) || matchesPackage(args.path, config.runtimeExternals))
            return { path: args.path, external: true };
          if (args.path.endsWith(".node")) {
            const resolved = await build.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir,
              importer: args.importer, pluginData: { nativeResolution: true } });
            if (resolved.errors.length) return resolved;
            // Extensionless requests such as grammy's ./platform.node can resolve to .node.js.
            if (resolved.path.endsWith(".node")) return { errors: [{ text: `Native dependency ${args.path} must remain inside a declared runtimeExternals package` }] };
            return resolved;
          }
        });
      } }],
    });
    assertRuntimeModules(Object.keys(result.metafile.inputs));
    const shared = new Set<string>(), privateImports = new Set<string>();
    for (const [path, output] of Object.entries(result.metafile.outputs)) {
      const outputPath = portable(relative(buildDirectory, resolve(root, path)));
      if (output.entryPoint) {
        for (const [name, source] of Object.entries(runtime.input)) {
          if (resolve(root, output.entryPoint) !== source) continue;
          if (name === "runtime" || name === "storage") artifact[name] = outputPath;
          for (const [specifier, publicName] of runtime.publicNames) if (name === publicName) artifact.public.runtime[specifier] = outputPath;
        }
      }
      for (const request of output.imports.filter(item => item.external).map(item => item.path)) {
        if (isSharedImport("runtime", request, config)) shared.add(request);
        else if (matchesPackage(request, config.runtimeExternals)) privateImports.add(request);
      }
    }
    artifact.imports.runtime = [...shared].sort(); artifact.runtimeExternals = [...privateImports].sort();
  }
  const renderer = entries(root, "renderer", config);
  if (Object.keys(renderer.input).length) {
    const owned = config.public?.renderer ?? {};
    const shared = new Set<string>(), styles = new Set<string>();
    const metadata: VitePlugin = {
      name: "asterism-renderer-boundaries", enforce: "pre",
      resolveId(source) {
        if (Object.hasOwn(owned, source)) return realpathSync(resolve(root, owned[source]!));
        if (isSharedImport("renderer", source, config)) return { id: source, external: true };
      },
      generateBundle: { order: "post", handler(_options, bundle) {
        assertRuntimeModules(this.getModuleIds());
        for (const output of Object.values(bundle)) {
          if (output.type === "asset") {
            if (output.fileName.endsWith(".css")) styles.add(`renderer/${output.fileName}`);
            continue;
          }
          if (output.isEntry) {
            if (output.name === "renderer") artifact.renderer = `renderer/${output.fileName}`;
            for (const [specifier, name] of renderer.publicNames) if (output.name === name) artifact.public.renderer[specifier] = `renderer/${output.fileName}`;
          }
          for (const request of [...output.imports, ...output.dynamicImports]) {
            if (isSharedImport("renderer", request, config)) shared.add(request);
          }
        }
      } },
    };
    await viteBuild({
      root, configFile: false, envDir: false, publicDir: false, base: "./", logLevel: "warn",
      // Browser dependencies may use CommonJS internally; shared boundaries still load as ESM.
      plugins: [esmExternalRequirePlugin({ external: rendererExternals(config) }), metadata, rendererAssets(root)],
      worker: { rolldownOptions: { cwd: root } },
      css: { modules: { generateScopedName(name, filename) {
        const namespace = createHash("sha256").update(`${manifest.id}\0${portable(relative(root, filename.split("?")[0]!))}\0${name}`).digest("hex").slice(0, 20);
        return `asterism_${namespace}_${name}`;
      } } },
      build: {
        outDir: join(buildDirectory, "renderer"), emptyOutDir: false, copyPublicDir: false,
        target: "es2022", minify: false, sourcemap: false, modulePreload: false,
        cssCodeSplit: false, assetsInlineLimit: 0,
        rolldownOptions: {
          cwd: root, input: renderer.input, preserveEntrySignatures: "strict",
          onwarn(warning, report) {
            // React client directives have no boundary semantics in this browser-only graph.
            if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes('"use client"')) return;
            report(warning);
          },
          output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs", assetFileNames: "assets/[name]-[hash][extname]" },
        },
      },
    });
    artifact.imports.renderer = [...shared].sort(); artifact.stylesheets = [...styles].sort();
  }
  for (const asset of config.assets ?? []) {
    // Asset rules keep their package-relative layout inside the immutable build tree.
    const normalized = portable(asset).replace(/^\.\//u, "");
    if (normalized === "artifact.json" || /^(?:backend|renderer)(?:\/|$)/u.test(normalized))
      throw new Error(`Asset ${asset} conflicts with reserved build output paths`);
    await cp(resolve(root, asset), join(buildDirectory, normalized), { recursive: true, force: false, errorOnExist: true });
  }
  artifactSchema.parse(artifact);
  await writeFile(join(buildDirectory, "artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  const pointer = pointerSchema.parse({ format: 1, build: `builds/${buildId}` });
  const temporaryPointer = `${pointerPath}.${buildId}.tmp`;
  try {
    await writeFile(temporaryPointer, `${JSON.stringify(pointer, null, 2)}\n`);
    await rename(temporaryPointer, pointerPath);
  } catch (error) {
    await rm(temporaryPointer, { force: true });
    throw error;
  }
  return { root, buildDirectory, pointerPath, pointer, artifact };
}
