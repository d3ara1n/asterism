# Build a plugin artifact

The standalone authoring tool for prebuilt Asterism plugins. Building does not require an installed Asterism application or execute plugin entries. The application loads completed artifacts; it does not compile source at startup.

The builder requires Node.js 22.15.0 or newer on the authoring machine. The installed application supplies its own runtime; this authoring requirement does not require application users to install Node.js.

Install `@asterism-app/plugin-build` as a development dependency and run `asterism-plugin-build` in the plugin package directory. `--root <directory>` selects another package directory. Programmatic callers use `await buildPlugin({ root })` from `@asterism-app/plugin-build`; the result contains `root`, `outputDirectory`, and `artifact`.

## Inputs

Author configuration lives in `package.json.asterism.build`; the exported `BuildConfig` type describes it. `runtime`, `storage`, and `renderer` are package-relative source entries. Runtime and storage share one backend graph; the renderer and its public entries share a separate browser graph. `public.runtime` and `public.renderer` list the bare specifiers this plugin provides in each realm. Each specifier resolves through ordinary package resolution: the plugin's own package `exports` (a self-reference), or an installed API package. Browser public entries use the `browser` export condition when present. Public ownership is package-wide, so every subpath of a provided package that the plugin imports must be listed.

The package's dependency declarations define the remaining boundaries:

- `peerDependencies` are supplied at load time, either by the application or by another enabled plugin's public entries. Their imports stay external in both graphs and are recorded in the artifact. Imports of application-supplied modules (the SDK, shared UI, React, React Intl, Zod, Sonner, and Motion) must be declared as peers; the build fails otherwise, because a private copy would split their shared instances.
- `dependencies` and `optionalDependencies` are private. The backend graph does not bundle them: Node resolves them from the installed package, with their own export conditions, package-relative files, and native binaries. A backend import of an undeclared package fails the build. The browser graph bundles them, and CommonJS code inside them reaches peers through ESM imports.

A missing provider is a host loading error, not permission to use a consumer's private API copy. A peer import inside an installed dependency's own code follows ordinary npm resolution, so only the plugin's own code is guaranteed to share the provider's instance.

## Output

Each successful build writes a new tree and then replaces the package's `dist` directory with it; a failed build leaves the previous `dist` untouched. `dist/artifact.json` describes the output: entry files, public entry files per realm, recorded peer imports, and stylesheets. All paths are portable and relative to `dist`. Rebuilding while an application runs from the same directory replaces files that application may still load lazily; restart it after building.

Both executable graphs reject test-source files and the Vitest runner. Output is production code regardless of the caller's `NODE_ENV`.

CSS Modules use plugin and stylesheet identity in their generated names. All CSS emitted by browser entries, public entries, and lazy chunks is recorded as an eager, deduplicated stylesheet closure. Global styles still share the document cascade. Browser outputs have no HTML entry or module-preload dependency.

Vite handles browser workers and ordinary assets. Explicit `?url` file/directory imports preserve resource names and directory topology, including sibling files fetched by a worker. This does not rewrite arbitrary computed paths. Backend code reads package files through ordinary paths relative to its installed package.

The host-facing Zod schema and type are available from `@asterism-app/plugin-build/artifact` as `artifactSchema` and `PluginArtifact`, together with `artifactDirectory`, `artifactFile`, and the application-supplied module list `hostModules`.

## Distribution

Produce releases from a clean checkout: install authoring dependencies, build once, and pack that package. The tarball must contain `package.json`, `dist`, and the files the manifest references; runtime dependencies install through the package's ordinary `dependencies`.
