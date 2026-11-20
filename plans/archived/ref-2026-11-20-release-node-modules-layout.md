# Release node_modules layout

The Asterism 1.0.0 Windows x64 artifact contains 27,823 loose dependency files (354.97 MiB). Two decisions are independent: the package manifest and electron-builder select which production dependencies ship, and `asarUnpack: ["docs/manual/**", "packages/**", "node_modules/**"]` makes the selected dependency files physical files. Inspect packaging and runtime paths before changing either decision.

## Where the files come from

`es-toolkit` (3,170 files, 2.89 MiB) is drawn in by Mermaid and React PDF; `lucide-react` (2,299 files, 8.61 MiB) is declared by the app, UI and builtin. Lodash has 1,050 files (1.35 MiB); its production dependency path in this lockfile includes Discord's `@sapphire/shapeshift`. These examples demonstrate why file count and bytes require separate treatment. PDF.js's optional `@napi-rs/canvas` pulls in a Windows binary and ICU data of about 37 MiB; do not assume it is needed by the browser PDF viewer. There are both root and Mermaid-nested versions of ELK. Renderer sourcemaps show Mermaid, Lucide and ELK sources already compiled into renderer chunks, but their source packages also appear in the published node_modules. Before excluding a package, check the compiled host and builtin backend imports, dynamic assets, and authoring consumers rather than infer from the source declaration alone.

## The ASAR boundary is an import boundary

`applicationDirectory('packages')` currently rewrites the builtin root to `app.asar.unpacked`. The plugin builder deliberately leaves backend bare imports external, and `verifyPackagedPlugins` currently assumes a physical dependency tree. A fixture using this repository's Electron and a real ASAR, with a physically unpacked builtin entry and a dependency stored in the archive, resolved the bare dependency when the builtin was loaded as `app.asar/packages/builtin/entry.mjs` and failed with `ERR_MODULE_NOT_FOUND` for `app.asar.unpacked/packages/builtin/entry.mjs`. Thus removing the wildcard alone is not a correct patch. Keep distribution import resolution in the ASAR namespace; map to the physical path only for an actual OS consumer. User-installed plugins stay in their existing physical roots. Verify archive contents using the actual ASAR header and smoke-test ordinary package and shared-host imports using the built Electron artifact.

## Proposed sequence

1. Separate logical package paths from the physical paths for tools. Keep pnpm's launcher and required assets, ripgrep, and native modules and their runtime companions unpacked. Inspect what electron-builder auto-unpacks; keep intentional file assets unpacked only where a consumer needs that. Avoid changing third-party plugin contracts or rewriting globally how backends bundle dependencies.
2. Narrow `asarUnpack`, let normal dependencies use the archive, and change packaging verification and its integration fixtures accordingly. Protect SDK example assets and author-facing declarations. Use actual Windows and macOS artifact inventories and package-load checks, not elapsed-time measurements, to accept the change.
3. Remove confirmed renderer-only or build-only package copies and unused platform/build artifacts from the distribution as a separate change. Keep source/dev dependencies where needed. Do not globally remove TypeScript files: first-party exports and public examples intentionally use them.

This investigation did not change packaging, dependency declarations, NSIS or the updater.

## Disposition

The desktop main and bundled plugin builds now emit their external runtime imports. The release walks the corresponding installed npm graph and generates package-level filters; no per-library exclusion list is maintained. Ordinary packages resolve through ASAR. Built-in manual sources and the package-manager launch input declare the physical files their consumers need. The post-pack verifier checks the resulting archive and declared physical inputs.

Validated with the normal checks and plugin integration suite, a native macOS directory build with the packaged built-in plugin, a real-ASAR launcher fixture, and a native ripgrep search in the installed SDK examples. A Windows x64 directory cross-build produced 256 loose files under `app.asar.unpacked/node_modules`, compared with 27,823 in the released v1.0.0 Windows package. The cross-build used macOS-installed native dependencies, so that count is not a native Windows release count or installer acceptance result. No installation timing was measured.
