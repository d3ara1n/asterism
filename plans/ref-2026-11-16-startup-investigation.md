# Startup investigation: verified findings

Filed on 2026-11-16. This record contains observed behavior and measured conclusions, not an adopted solution, recommendation or implementation direction. Runtime experiments and their implementation/documentation changes were removed during workspace cleanup; the repository implementation was restored to `983d1355566626b6b81095dc1ad6acf575ed7f2f` for the affected files.

## Existing implementation at the investigated revision

- Each startup discovers enabled plugin packages and invokes compilation. Content-addressed output directories do not themselves skip compilation.
- Individual package preflights isolate compilation failures. Dependency-connected backend groups are compiled together; accepted renderer packages are compiled together.
- Shared public declarations, state and class identity are represented by a common ESM graph. Host bridges supply shared SDK, React and other context-bearing instances. Unified renderer compilation provides distinct CSS Module names across plugins.
- One package can have both runtime and storage entry points in a backend build. Package count and entry-point count are different.
- Runtime externals can contain resolved absolute paths. Package assets and manuals can retain relationships to source package directories. The emitted graph is not a self-contained, location-independent package.
- Storage admission and migrations run separately from code compilation. The runtime consumes the graph handed off by the current preparation process.
- Package selection persists separately from the active startup result. The implementation exposes local-directory and bundled-package selection operations; an npm source variant resolves an existing package location rather than implementing a complete package installation/update transaction.

## Recorded application startup timings

The initial investigation read existing logs rather than performing controlled cold-machine benchmarks. On this machine, the three sampled installed-app startups had recorded backend-stage totals of 2.55–3.08 seconds, including 1.62–1.67 seconds in plugin data preparation. Four sampled development startups had backend-stage totals of 2.58–3.18 seconds, including 1.93–2.50 seconds in plugin data preparation. These stage totals do not include frontend readiness or development-tool work before Electron starts.

A temporary broad-metadata-cache implementation was then exercised through three fresh development starts:

| Sample | Cache check | Check plus plugin compilation | Main-start log to frontend commit |
| --- | --- | --- | --- |
| 1 | 968 ms | 2897 ms | 3890 ms |
| 2 | 968 ms | 2733 ms | 3630 ms |
| 3 | 980 ms | 2755 ms | 3666 ms |

All three were cache misses. That implementation included the repository's generated `dist` files when an ancestor tsconfig expanded the inspected directory tree. Fresh development launches rewrote those files, changing their metadata. The third sample's main artifacts were rewritten approximately 195 ms before the application-start log.

Earlier repeated calls in the same unchanged environment had hit this cache in approximately 550 ms. Those results did not establish reuse across fresh development launches. The implementation was not retained.

## Isolated compiler experiments

Environment: macOS arm64, Node 26.13.0. The application's Electron utility processes used Node 24.22.1. Compiler experiments used isolated data and separate Node subprocesses, not the actual application startup lifecycle.

The Webpack experiment used Webpack 5.112.2, esbuild-loader 4.5.0, css-loader 7.1.5, mini-css-extract-plugin 2.10.2 and esbuild 0.28.2. Its adapter was partial; it did not reproduce the complete production resolver, admission or failure-orchestration contract. Application dependencies were not changed.

The esbuild baseline used the original compiler and assembly files from `983d1355566626b6b81095dc1ad6acf575ed7f2f` with the investigated builtin sources and dependencies. It did not include the temporary broad metadata scan. Subprocess wall times included process startup and exit; Webpack measurements included compiler closure and persistent-cache flush.

| Experiment | Subprocess wall times | Observed result |
| --- | --- | --- |
| Existing esbuild path, complete builtin, three fresh processes | 1830, 1728, 1774 ms | All builds ready |
| Same-invocation reuse of identical single-package preflight results | 1033, 1030, 1033 ms | All builds ready |
| Webpack builtin renderer, empty compilation cache | 1575 ms | 902 modules built |
| Webpack builtin renderer, three fresh warm processes | 522, 520, 512 ms | 0 built / 902 cached |
| Webpack renderer after an actual host application build | 543 ms | 0 built / 902 cached |
| Webpack complete builtin, cold / warm | 2664 / 754 ms | Both builds failed; not accepted successful-build timings |

These measurements exclude window creation, application data preparation, runtime imports and frontend mounting. Renderer-only Webpack numbers and complete-builtin esbuild numbers measure different work. They do not establish an end-to-end application speedup or cross-platform acceptance.

### Same-invocation esbuild result reuse

The experimental variant reused a successful per-package, per-realm preflight when the final group contained that same single package. Multi-package final builds remained unchanged. This was not cross-process caching.

For the builtin fixture, all 1511 emitted files were byte-identical to the baseline. A temporary source-loader override passed 27 existing plugin integration tests, including shared declaration/state/class identity, failed providers, external helpers, CSS/assets, startup capture and storage admission. The measured complete-builtin subprocess reduction was approximately 42% for these samples. No corresponding percentage was established for multi-package compositions or full application startup.

### Webpack fixture results

The isolated adapter demonstrated the following across fresh processes:

- Unchanged inputs reused cached modules; rewriting an unrelated generated host file did not rebuild them.
- Source edits, a higher-priority file extension, package-export changes and a nearer dependency changed the result.
- Provider/consumer object identity and ESM live bindings survived cache restoration. A disabled provider did not fall back to a consumer-private copy.
- An external host-table object retained identity.
- Same-named CSS Module classes in separate directories were distinct.
- Added directory-resource members appeared in emitted output.
- Runtime external package-relative assets worked, and changing the external package entry changed resolution.
- Deleted outputs were emitted again from the compiler cache.

A negative configuration case was also established. esbuild-loader 4.5.0 read tsconfig without registering it as a loader dependency. Changing `useDefineForClassFields` while keeping source unchanged restored stale compiled behavior: the expected result was `[]`, but the result remained `[1]`. Registering that known configuration in `cache.buildDependencies` corrected the fixture. Arbitrary nested and extended configuration coverage was not established.

The real builtin backend failed to resolve optional `zlib-sync` in `@discordjs/ws`. That dependency used a lazy `import(...).then(...).catch(() => null)` accepted by the existing esbuild path; the tested Webpack configuration reported a build error. Other optional-dependency and dynamic-request warnings remained. The failing full-graph warm timing was not a successful compilation result.

## Startup regression during experimentation

A temporary static import of external `esbuild/package.json` lost its JSON import attribute in the electron-vite output. The preparation process exited with `ERR_IMPORT_ATTRIBUTE_MISSING` before application data preparation ran. A compiled-entry execution test detected this class of failure; source-level tests and a successful build alone had not detected it. This import belonged to the discarded experiment, not the restored implementation.

Frontend application import was temporarily overlapped with backend preparation and later returned to serial post-backend loading. No causal relationship between that overlap and the reported shutdown residual was established.

## Shutdown observations

The user reported a disappearing window followed by a residual process. The failed-startup sample recorded business cleanup completing in 1 ms. Three later successful-startup samples recorded business cleanup in 14, 13 and 16 ms, and process-output drain completion 138, 111 and 129 ms after the quit request. All three reported zero pending process-output streams at log shutdown.

The temporary final log-close and Electron-quit diagnostics were console-only after the file logger ended. Their absence from the file log did not establish that final exit failed. A later process listing contained no development Electron process, but did not establish whether it had exited without user intervention.

Isolated, windowless utility-process probes with a failing child drained output, closed the logger and exited successfully. They did not reproduce the user-reported application residual. Its cause remains unresolved; business-cleanup completion is not a measurement of final process exit.

## Documented tool capabilities

The following are documentation facts, not selections for Asterism:

- esbuild contexts retain incremental file/AST state in memory; plugin watch dependencies include file reads, directory membership and attempted existence checks.
- Webpack exposes filesystem caching, build dependencies and existing/context/missing dependency registration for custom loaders.
- Parcel caches build work to disk and exposes resolver invalidation for file changes and file creation.
- Vite dependency-prebundling invalidation uses inputs including lockfile content, patches, relevant configuration and environment; linked source is distinguished from installed dependencies.
- Nx task caching operates on declared or inferred task inputs and outputs.
- VS Code extension guidance describes development/packaging builds and runtime entry points referring to compiled output.

Documentation inspected on 2026-11-16:

- https://esbuild.github.io/api/#rebuild
- https://esbuild.github.io/plugins/#on-load-results
- https://webpack.js.org/configuration/cache/
- https://webpack.js.org/api/loaders/
- https://parceljs.org/features/development/#caching
- https://parceljs.org/plugin-system/resolver/#cache-invalidation
- https://vite.dev/guide/dep-pre-bundling#caching
- https://nx.dev/docs/concepts/how-caching-works
- https://code.visualstudio.com/api/working-with-extensions/bundling-extension
