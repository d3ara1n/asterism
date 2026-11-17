import { realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join, relative, resolve } from "node:path";
import { build as esbuild } from "esbuild";
import { build as viteBuild, esmExternalRequirePlugin, type Plugin as VitePlugin } from "vite";
import { artifactDirectory, artifactFile, artifactSchema, hostModules, hostPackageNames, isHostModule, sharedUiPackage, type PluginArtifact } from "./artifact.js";
import { isBareRequest, manifestSchema, matchesPackage, packageName, type Realm } from "./config.js";
import { rendererAssets } from "./renderer-assets.js";
import { assertRuntimeModules } from "./inputs.js";

export type { BuildConfig } from "./config.js";

export interface BuildPluginOptions {
  /** Package directory containing package.json, absolute or relative to the calling process directory. */
  root: string;
}
export interface BuildPluginResult {
  root: string;
  /** The package's dist directory, replaced as a whole by each successful build. */
  outputDirectory: string;
  artifact: PluginArtifact;
}
const portable = (path: string) => path.replaceAll("\\", "/");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Owned public specifiers resolve through ordinary package resolution, including package self-references. */
async function resolvePublic(root: string, realm: Realm, specifiers: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  if (!specifiers.length) return files;
  await esbuild({
    absWorkingDir: root, bundle: true, write: false, logLevel: "silent", platform: realm === "runtime" ? "node" : "browser",
    stdin: { contents: specifiers.map(specifier => `import ${JSON.stringify(specifier)};`).join("\n"), resolveDir: root },
    plugins: [{ name: "asterism-public-entries", setup(build) {
      build.onResolve({ filter: /.*/ }, async args => {
        if (args.pluginData) return;
        if (args.importer !== "<stdin>") return { path: args.path, external: true };
        const resolved = await build.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, pluginData: true });
        if (resolved.errors.length) return { errors: resolved.errors };
        files.set(args.path, realpathSync(resolved.path));
        return { path: args.path, external: true };
      });
    } }],
  });
  for (const specifier of specifiers) if (!files.has(specifier)) throw new Error(`Public entry ${specifier} could not be resolved in ${realm}`);
  return files;
}

/** Build one package without reading application configuration or executing plugin entries. */
export async function buildPlugin({ root: requestedRoot }: BuildPluginOptions): Promise<BuildPluginResult> {
  const root = realpathSync(resolve(requestedRoot));
  const pkg = manifestSchema.parse(JSON.parse(await readFile(join(root, "package.json"), "utf8")));
  const { id, build: config } = pkg.asterism;
  // Peer dependencies are the shared boundary: the host or another enabled plugin supplies them at load time.
  const peers = new Set(Object.keys(pkg.peerDependencies ?? {}));
  const installed = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...peers, ...pkg.name ? [pkg.name] : []]);
  // Public ownership is package-wide: an own public package is never also a private or peer import.
  const ownedPackages = new Set([...config.public?.runtime ?? [], ...config.public?.renderer ?? []].map(packageName));
  for (const name of ownedPackages) {
    if (peers.has(name)) throw new Error(`Public package ${name} cannot also be a peer dependency`);
    if (hostPackageNames.has(name)) throw new Error(`Public package ${name} is owned by the application`);
  }
  const assertBoundary = (realm: Realm, request: string, owned: ReadonlyMap<string, string>) => {
    if (matchesPackage(request, ownedPackages) && !owned.has(request))
      throw new Error(`${request} belongs to a public package of this plugin; declare it in build.public.${realm}`);
    if (matchesPackage(request, hostPackageNames)) {
      if (!isHostModule(realm, request)) throw new Error(`${request} is not a module the application supplies in ${realm}`);
      if (!matchesPackage(request, peers)) throw new Error(`${request} is supplied by the application; declare ${packageName(request)} in peerDependencies`);
    }
  };
  const temporary = join(root, `.asterism-build-${randomUUID()}`);
  const artifact: PluginArtifact = { format: 2, id, public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, stylesheets: [] };
  try {
    await mkdir(temporary, { recursive: true });
    const runtimePublic = await resolvePublic(root, "runtime", config.public?.runtime ?? []);
    const runtimeInput: Record<string, string> = {};
    if (config.runtime) runtimeInput.runtime = realpathSync(resolve(root, config.runtime));
    if (config.storage) runtimeInput.storage = realpathSync(resolve(root, config.storage));
    [...runtimePublic.values()].forEach((file, index) => { runtimeInput[`public-${index}`] = file; });
    if (Object.keys(runtimeInput).length) {
      const owned = new Map(runtimePublic);
      const result = await esbuild({
        absWorkingDir: root, entryPoints: runtimeInput, outdir: join(temporary, "backend"),
        // Installed packages stay external: Node resolves them from this package, with their own conditions and files.
        bundle: true, splitting: true, packages: "external", format: "esm", platform: "node", target: "node22",
        outExtension: { ".js": ".mjs" }, entryNames: "[name]", chunkNames: "chunks/[name]-[hash]",
        metafile: true, sourcemap: false, logLevel: "silent", jsx: "automatic",
        plugins: [{ name: "asterism-owned-public", setup(build) {
          if (!owned.size) return;
          // esbuild filters use Go regular expression syntax without JavaScript flags.
          build.onResolve({ filter: new RegExp(`^(?:${[...owned.keys()].map(escape).join("|")})$`) }, args => ({ path: owned.get(args.path)! }));
        } }],
      });
      const external = Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path));
      assertRuntimeModules([...Object.keys(result.metafile.inputs), ...external]);
      const shared = new Set<string>();
      for (const request of external) {
        if (!isBareRequest(request) || isBuiltin(request)) continue;
        assertBoundary("runtime", request, owned);
        if (matchesPackage(request, peers)) shared.add(request);
        else if (!matchesPackage(request, installed))
          throw new Error(`Backend import ${request} is not declared in dependencies or peerDependencies`);
      }
      artifact.imports.runtime = [...shared].sort();
      for (const [path, output] of Object.entries(result.metafile.outputs)) {
        if (!output.entryPoint) continue;
        const file = portable(relative(temporary, resolve(root, path)));
        const source = realpathSync(resolve(root, output.entryPoint));
        if (source === runtimeInput.runtime) artifact.runtime = file;
        if (source === runtimeInput.storage) artifact.storage = file;
        for (const [specifier, entry] of runtimePublic) if (entry === source) artifact.public.runtime[specifier] = file;
      }
    }
    const rendererPublic = await resolvePublic(root, "renderer", config.public?.renderer ?? []);
    const rendererInput: Record<string, string> = {};
    if (config.renderer) rendererInput.renderer = realpathSync(resolve(root, config.renderer));
    const publicNames = new Map<string, string>();
    [...rendererPublic].forEach(([specifier, file], index) => { rendererInput[`public-${index}`] = file; publicNames.set(`public-${index}`, specifier); });
    if (Object.keys(rendererInput).length) {
      const owned = new Map(rendererPublic);
      // Peers stay external except host-package subpaths the application does not supply; dependencies bundle those privately.
      const externalPeer = (request: string) => matchesPackage(request, peers)
        && (!matchesPackage(request, hostPackageNames) || isHostModule("renderer", request));
      const peerMatchers = [...peers].flatMap(name => hostPackageNames.has(name)
        ? hostModules.renderer.filter(specifier => packageName(specifier) === name).map(specifier => new RegExp(`^${escape(specifier)}$`, "u"))
          .concat(name === sharedUiPackage ? [new RegExp(`^${escape(name)}/`, "u")] : [])
        : [new RegExp(`^${escape(name)}(?:$|/)`, "u")]);
      const shared = new Set<string>(), styles = new Set<string>();
      const boundaries: VitePlugin = {
        name: "asterism-renderer-boundaries", enforce: "pre",
        resolveId(source, importer) {
          if (owned.has(source)) return owned.get(source)!;
          if (!isBareRequest(source)) return;
          // The boundary contract applies to the plugin's own sources; installed dependencies follow ordinary resolution.
          if (!importer || !/[\\/]node_modules[\\/]/u.test(importer)) assertBoundary("renderer", source, owned);
          if (externalPeer(source)) return { id: source, external: true };
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
              const specifier = publicNames.get(output.name);
              if (specifier) artifact.public.renderer[specifier] = `renderer/${output.fileName}`;
            }
            for (const request of [...output.imports, ...output.dynamicImports])
              if (isBareRequest(request) && externalPeer(request)) shared.add(request);
          }
        } },
      };
      await viteBuild({
        root, configFile: false, envDir: false, publicDir: false, base: "./", logLevel: "warn",
        plugins: [
          // CommonJS dependencies bundled for the browser reach shared peers through ESM imports, not a browser require.
          esmExternalRequirePlugin({ external: peerMatchers }),
          boundaries, rendererAssets(root),
        ],
        // Artifacts are production output regardless of the caller's NODE_ENV; the development JSX runtime is not supplied.
        oxc: { jsx: { runtime: "automatic", development: false } },
        worker: { rolldownOptions: { cwd: root } },
        css: { modules: { generateScopedName(name, filename) {
          // All plugins share one document; names include plugin and stylesheet identity.
          const namespace = createHash("sha256").update(`${id}\0${portable(relative(root, filename.split("?")[0]!))}\0${name}`).digest("hex").slice(0, 20);
          return `asterism_${namespace}_${name}`;
        } } },
        build: {
          outDir: join(temporary, "renderer"), emptyOutDir: false, copyPublicDir: false,
          target: "es2022", minify: false, sourcemap: false, modulePreload: false,
          cssCodeSplit: false, assetsInlineLimit: 0,
          rolldownOptions: {
            cwd: root, input: rendererInput, preserveEntrySignatures: "strict",
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
    artifactSchema.parse(artifact);
    await writeFile(join(temporary, artifactFile), `${JSON.stringify(artifact, null, 2)}\n`);
    // Replace the previous output only after this build completed; a failed build leaves it untouched.
    const outputDirectory = join(root, artifactDirectory);
    const previous = `${temporary}-previous`;
    await rename(outputDirectory, previous).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    await rename(temporary, outputDirectory);
    await rm(previous, { recursive: true, force: true });
    return { root, outputDirectory, artifact };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
