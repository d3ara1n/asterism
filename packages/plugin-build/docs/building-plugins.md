# Build a plugin artifact

The standalone authoring tool for prebuilt Asterism plugins. Building does not require an installed Asterism application or execute plugin entries. The application loads completed artifacts; it does not compile source at startup.

The builder requires Node.js 22.15.0 or newer on the authoring machine. The installed application supplies its own runtime; this authoring requirement does not require application users to install Node.js.

Install `@asterism-app/plugin-build` as a development dependency and run `asterism-plugin-build` in the plugin package directory. `--root <directory>` selects another package directory. Programmatic callers use `await buildPlugin({ root })` from `@asterism-app/plugin-build`; the result contains `root`, `buildDirectory`, `pointerPath`, `pointer`, and `artifact`.

The exported `BuildConfig` type describes the authoring inputs. Author configuration lives in `package.json.asterism.build`. The manifest's `artifact` is `dist/plugin.json`. Runtime and storage sources share one backend graph; the renderer and its public entries share a separate browser graph. Declare each owned public source under `build.public.runtime` or `build.public.renderer`. Sources can refer to installed authoring packages or sibling workspace sources. Owned bare imports resolve to these explicit entries, preserving shared state within each realm. The builder does not discover exports by executing code.

`publicDependencies` classifies consumer public requests as external. Each declaration matches its exact request and slash-separated descendants. Host integration imports are external automatically. Private runtime packages that require native binaries or package-relative resources belong in `runtimeExternals`. Their imports remain bare requests, including Node's distinct import and require conditions; the installed dependency tree must accompany the artifact. A missing provider is a host loading error, not permission to use a consumer's private API copy.

Both executable graphs reject test-source files and the Vitest runner. Every successful build creates a new `dist/builds/<build-id>/artifact.json` and publishes `dist/plugin.json` last. Existing builds remain intact, including chunks needed by an already-running application. Build failures leave the prior pointer selected. Cleanup is an explicit author operation after old builds are no longer in use. Produce releases from a clean checkout: install authoring dependencies, build once, and pack that package. This includes the selected build and its required package files/dependencies rather than accumulated local build history. Clean an existing output tree only after running applications no longer use it.

CSS Modules use plugin and stylesheet identity in their generated names. All CSS emitted by browser entries, public entries, and lazy chunks is recorded as an eager, deduplicated stylesheet closure. Global styles still share the document cascade. Browser outputs have no HTML entry or module-preload dependency.

Vite handles browser workers and ordinary assets. Explicit `?url` file/directory imports preserve resource names and directory topology, including sibling files fetched by a worker. `build.assets` copies package-relative files/directories into the build directory at the same relative paths; `artifact.json`, `backend/`, and `renderer/` are reserved output locations. This does not rewrite arbitrary computed paths or backend `import.meta.url` resource references.

`--watch` rebuilds on changes below the selected package root, excluding `dist`, `node_modules`, and `.git`. Sources outside that tree and dependency changes require another explicit build. Changes during a build queue another build; watch errors are reported without replacing the last successful pointer.

The host-facing Zod schemas and types are available from `@asterism-app/plugin-build/artifact`: `pointerSchema`, `artifactSchema`, `ArtifactPointer`, and `PluginArtifact`. All emitted descriptor paths are portable and relative to their descriptor's build directory (or to the pointer directory for the build pointer).
