# Unified plugin artifacts and distribution

Filed on 2026-11-17. The user approved this design and implementation on the same date. The proposal below preserves the decision context; its implementation disposition is recorded at the end. This is not GUI or cross-platform acceptance, nor authorization to change real application data.

## Confirmed direction

- Plugin source transformation is an explicit author/build operation, not application startup work.
- The application has no development-versus-production plugin mode. Bundled, local-directory, and npm-managed sources differ in acquisition and ownership, not executable format or lifecycle.
- A local package may live in a Git checkout. Asterism registers its directory; it does not need to clone, pull, or otherwise manage that repository.
- npm supplies package distribution. Asterism supplies its own installation and management interface.
- Builtin uses the same artifact and loading contract as other plugins.

The detailed contracts below are recommendations. New package dependencies, installation-script behavior, public module contracts, storage formats, and UI interaction changes require approval before implementation.

## Architecture

Separate four responsibilities:

1. **Authoring/build:** transform one plugin's source and assets into a completed artifact.
2. **Acquisition:** obtain an npm installation or locate a user-owned/bundled package directory.
3. **Selection:** persist which plugin installation is selected and enabled for the next application startup.
4. **Loading:** capture selected artifacts, resolve public dependencies, admit current data, and initialize contributions.

Acquisition success is not activation success. Loading has no compiler, package-manager invocation, source fallback, automatic update, or network dependency. A normal restart does not check whether source files changed.

## Package and artifact contract

Keep the package root as the unit registered by a local directory or resolved by an installation. A source checkout and an npm package can both contain that root. Source may coexist with output, but only a generated artifact descriptor supplies executable entries.

Separate authoring configuration from the runtime contract:

- `package.json`: npm identity/version/dependencies, plugin identity/display metadata, and a pointer to the generated artifact descriptor.
- Build configuration: source entries, realm-specific owned public entries, public dependency classification, private runtime externals, and asset rules.
- Generated descriptor: fixed artifact-format version, completed build identity, relative executable/stylesheet paths, exact realm-specific public exports, used public/host import requests, and private external requirements.

Illustrative output layout, not a finalized schema:

```text
plugin-package/
  package.json
  dist/
    plugin.json                  # selects the completed build
    builds/<build-id>/
      artifact.json
      backend/
        runtime.mjs
        storage.mjs
        public/...
        chunks/...
      renderer/
        renderer.mjs
        public/...
        chunks/...
        styles/...
        assets/...
  docs/...
  node_modules/...               # installed private runtime dependencies, if needed
```

An artifact is not required to be one file or dependency-free. It must not contain builder-machine absolute paths. Moving the package with its required installed dependencies must not require rebuilding JavaScript. Backend native dependencies remain platform/runtime dependent.

The descriptor is loading metadata, not another dependency lockfile or a source-fingerprint database. The npm package version remains the release version. The artifact-format version describes a software interface, not an optimistic-concurrency revision.

Missing output is an explicit unavailable state. A failed build reports failure and does not replace the last successful descriptor. Source changes without a successful explicit build do not change the selected executable code; the application does not claim to detect unbuilt changes.

## Build tool

Provide a standalone official build package/CLI, provisionally `@asterism-app/plugin-build`. It works without an installed application or the user's plugin selection. Authors run it explicitly; optional watch mode belongs to this tool, not to the application loader.

Build one plugin independently, with a multi-entry graph for each realm:

- Backend: runtime, storage, and all owned backend public entries together, sharing ESM chunks.
- Browser: renderer and all owned browser public entries together, sharing ESM chunks.

Public-only plugins and public-only browser entries are valid. Building runtime, storage, and public entries independently would duplicate shared state and is not the contract.

Reuse maintained tools already present in the repository. Backend esbuild is suitable; renderer Vite is a concrete candidate for multi-entry output, assets, and supported CSS Modules naming. Do not implement a CSS parser or rewrite emitted selectors with regular expressions. Selecting exact build APIs does not require changing the application runtime to Bun or adopting a custom JavaScript module system.

The build tool must classify imports throughout the bundled graph, including shared helpers, not just entry files. Host imports are known SDK integration points. Plugin-public dependencies require explicit authoring declarations because a standalone build cannot see the application's enabled provider registry. Peer dependencies alone cannot identify plugin-public imports. Generated metadata records the imports actually used.

Owned public library code is included in the provider's build; consumers leave public imports external. Public entries are declared separately by realm rather than compiling every package export indiscriminately for both Node and the browser.

Use ordinary npm publishing, with a pack verification step that verifies the actual tarball contains the descriptor, selected output tree, declarations/manuals/catalogs, and required resources. The published package must not rely on installation running its source build. Ordinary runtime dependency installation is separate.

## Native module loading and identity

Use native ESM linking for plugin-owned public APIs:

- Backend: a narrowly scoped synchronous Node resolution hook maps host/public requests to canonical module URLs. Relative chunks and ordinary private dependencies retain standard resolution. Register the resolver in preparation and runtime processes before plugin imports.
- Browser: install a complete import map before any plugin renderer import. Map public requests to exact artifact URLs and host requests to canonical host facades. Serve relative chunks/assets through the existing plugin protocol with captured artifact-root mappings.

The hook resolves modules; it does not transpile source. Each public request resolves to exactly one provider module per realm. A disabled, failed, or missing provider never falls back to a consumer-private copy. Competing enabled owners fail explicitly. The provider's own implementation shares its public entry graph.

Plugin-owned public re-exports and mutable ESM bindings use real ESM modules, not snapshots copied from a global registry. Existing stable-value host facades may continue to supply SDK, React, Zod, UI, Motion, and Sonner instances. Such facades preserve exported value identity, not arbitrary reassignment of host exports or namespace-object identity. Builtin API remains plugin-owned; bundled distribution does not turn it into a host facade.

The supported cross-plugin boundary should be ESM imports/re-exports and literal dynamic imports that can be recorded in the artifact. Private CommonJS dependencies remain usable. Arbitrary computed cross-plugin imports or CommonJS public-boundary semantics are not silently promised; they need an explicit contract if required.

Node's `module.registerHooks` was added after the repository's currently declared minimum Node version. Establish the supported Node baseline and verify the bundled Electron runtime rather than adding a fallback loader ladder. Browser import-map bootstrap must comply with production CSP, including the packaged page; do not solve it by broadly enabling inline scripts.

## Styles and assets

Independent builds need deterministic CSS Module names incorporating plugin identity and package-relative stylesheet identity. Separate output directories alone do not prevent collisions in a shared document. Global CSS continues to participate in the document cascade.

Record styles required by public browser entries as well as renderer entries. The initial recommended loading policy is a plugin's admitted browser stylesheet closure, loaded before its renderer/public consumers and released with that plugin's browser lifetime. This makes that closure eager, not per-view or independently lazy CSS. Preserve stylesheet URL deduplication and failure cleanup.

Preserve supported URL asset handling, workers, lazy chunks, and directory resources. Do not claim support for every computed asset path or arbitrary worker dependency graph. Private backend packages that depend on native binaries or package-relative files stay intact and resolve from their owning installation. Preserve import-versus-require export conditions.

## Completed builds and startup capture

Prefer immutable completed build directories plus a small published descriptor over scanning, hashing, and copying the entire artifact tree on every startup.

The official builder writes a new build directory and publishes the descriptor only after success. It does not overwrite or automatically delete earlier build directories that a running application may reference. Explicit author cleanup removes old local builds when the application is no longer using them. npm packages include the selected build, not the author's entire build history.

Startup captures the selected descriptors, exact build paths, provider bindings, and dependency graph once. Storage preparation and the task runtime consume that same selection. A subsequent successful local build or managed installation changes a future startup, not the current graph. Renderer URLs remain bound to captured artifact directories so later lazy imports do not silently select a newer build.

This is an output publication/lifetime contract, not a promise to snapshot every user-owned file. Local external `node_modules`, package assets outside immutable output, and manuals remain owner-managed; replacing or deleting files still in use can fail. Managed npm installations avoid that issue by retaining the complete active installation tree. Do not add recursive source scans or speculative filesystem-race defenses.

Storage and runtime share backend modules within a process, not memory across preparation and task processes. Storage declarations and migration functions remain executable declarations; current-data admission runs on every startup. Backend and browser initialization graphs remain separate. Module cycles are not equivalent to valid plugin setup cycles.

Invalid artifacts and failed providers exclude their dependents; unrelated plugins continue. Browser activation failures remain page-local and do not undo accepted backend services. Trusted plugins still run in shared processes; this is not crash, hang, or side-effect isolation.

## Source ownership

| Source | Acquisition | Update | Removal |
| --- | --- | --- | --- |
| Bundled | Included in the application distribution | Application update | Remove selection; keep distribution files and add-back entry |
| Local directory | User selects an existing package root with a completed artifact | User manages Git/dependencies and explicitly builds | Remove registration; never delete the directory |
| npm-managed | Application obtains a selected registry package version | Explicit application-managed install of another exact version | Remove selection, then reclaim owned installation files after active use ends |

All three use the same admission, dependency, storage, setup, and shutdown behavior. No Git source adapter, developer mode, install-time compiler, or special builtin lifecycle is needed.

The selected configuration and running selection are distinct facts. Add, enable, disable, update, and removal take effect after restart, as they do today. Metadata inspection and downloading do not activate plugin code.

## npm acquisition

Use a maintained package manager rather than implementing dependency resolution, tarball extraction, optional dependencies, and integrity handling in the host. Recommendation: bundle a pinned pnpm distribution and invoke it through the application's supported Node execution environment, as DeepSeek Harness Desktop does. This is a new distribution dependency requiring approval. It does not imply migrating this repository from npm to pnpm.

Users should not need Node/npm/pnpm on PATH for ordinary managed installation. Registry configuration and credentials follow the chosen package-manager environment and application configuration; do not create a separate registry account system. Errors and package-manager diagnostics remain visible.

Use a separate managed project/installation directory for each concrete installation, with its own lockfile and private dependency tree. pnpm may reuse its package store. Do not treat a shared writable top-level `node_modules` as the active plugin catalog.

Installation flow:

1. Inspect an npm name, tag, range, or exact version and present the resolved exact version and source.
2. Confirm the installation, including its trusted-code implications.
3. Install into a new owned directory, recording the exact package identity, lockfile, and package-manager integrity information.
4. Validate the resulting artifact and plugin identity without executing runtime or migration entries.
5. Publish the new selected installation only after acquisition and artifact validation succeed.
6. Report that activation requires restart; perform data admission and initialization on that startup.

A staging/install failure leaves the selected old installation intact. Cancellation waits for the owned installer process to settle before cleanup. External effects of third-party install scripts are not rolled back. A later plugin activation failure is reported; it does not trigger silent downgrade, data rollback, or repeated installation.

Keep active installation directories intact during updates/removal, including external native packages. Reclaim superseded managed installations only after their active use has ended. An interrupted operation may leave unselected staging files; they are not plugin selections and can be reclaimed without introducing speculative transaction generations.

Resolve tags/ranges when the user requests installation or update, then persist an exact version. Startup does not follow `latest` or silently install updates. Do not automatically replace an enabled provider to satisfy a newly installed consumer. Same plugin ID from another source is a conflict, not an implicit takeover.

Retain the existing distinction between package-manager ranges and runtime admission. Artifact-format compatibility, missing modules/exports, and actual contribution validity govern loading. Do not introduce a new semver-based runtime rejection policy incidentally; unsupported declared ranges may be shown as compatibility information.

### Installation scripts and native code

Prebuilt plugin JavaScript does not eliminate dependency install scripts. Native packages can download prebuilds or require compilation, and a binary built for a system Node ABI may not work in Electron.

Recommended policy for approval: retain pnpm's explicit build-script approval mechanism, surface the blocked package list, and let the user approve those builds and resume the explicit installation. Do not silently skip required scripts and claim success. This is an installer operation, not a general plugin permission or sandbox model. Asterism continues to trust installed executable plugins.

The application should not install compilers or silently rebuild arbitrary native packages. Authors supply compatible platform prebuilds or a documented dependency installation path. Missing system tools, platform packages, or ABI compatibility produce visible installation/loading failures. Validate the bundled Node-mode launcher and actual target platforms before claiming portable installation.

### Package dependencies versus activated plugins

Ordinary npm dependencies install code; they do not independently activate Asterism plugins. Public provider requirements determine which other selected plugins must be available at runtime.

For the first implementation, report missing public providers and offer an explicit path to add/install them. Do not recursively discover and enable every dependency containing an `asterism` field. Automatic provider acquisition needs reliable publisher-owned identity/package metadata and a user-confirmed installation plan; it is not required to make the initial architecture coherent.

SDK, UI, and builtin API authoring packages provide types/build-time declarations. Their presence in a consumer's dependencies does not replace host instances or activate a provider. The build tool and public authoring packages need an explicit publication plan alongside plugin distribution.

## Management interface

Extend the existing host-owned plugin settings surface, not a builtin Agent tool or an external marketplace website.

First scope:

- Installed/registered list with source, plugin/package identity, selected version, running version where different, enabled state, availability, and restart requirement.
- Add local directory.
- Install npm package: package specification, metadata/exact-version preview, confirmation, progress/output, cancellation, and result.
- Check for updates, select an exact target version, and explicitly update.
- Enable/disable, remove registration/uninstall according to source ownership, and inspect failure diagnostics.
- Restore an available bundled package to the selection.

Use the current shared settings/object presentation. This is an interaction proposal, not approval of a visual redesign. Interface copy should distinguish actionable states without implementation narration.

Do not couple installation to a marketplace. npm metadata lookup for a known package is sufficient initially. A searchable npm keyword catalog or curated index can be added as a separate discovery feature; registry/index metadata is not certification of safety. DeepSeek Harness's optional index-based Discover is not evidence that a marketplace backend is necessary.

## Data, recovery, and removal

Keep plugin-private data, credentials, session objects, and history on removal, consistent with current behavior. Data cleanup is a separate explicit operation, not part of uninstalling code. Reinstalling the same plugin identity uses its existing data subject to normal storage admission.

Include managed selection and reproducibility metadata/lockfiles in the relevant application recovery contract. Installed package bytes and package-manager stores need not be duplicated into every recovery point. Restoring a selection whose installation is absent produces an actionable missing-installation state; reacquisition is explicit and uses the recorded version/lockfile where available, not an unannounced startup network request. A registry artifact may no longer be obtainable. Data recovery is not a promise to recreate a complete historical execution environment or reverse external install-script effects.

Do not silently discard current plugin selection or real data while changing development formats. Any real-data reset requires explicit user authorization. No third-party plugin compatibility bridge is needed for the currently approved source-to-artifact redesign, but that does not authorize clearing sessions or credentials.

## Implementation slices and acceptance

Implement one design in cohesive slices, not two competing loading paths:

1. Artifact/build contract and independent provider/consumer fixtures; prove backend ESM and browser import-map/CSP boundaries against the supported runtime.
2. Shared loader and builtin distribution conversion; remove startup compilation and source fallback; preserve storage/availability behavior.
3. Local-directory path and author tooling/examples; manually accept an externally located Git-checkout plugin using the same artifact format.
4. npm managed installation and settings controls; validate actual packed plugin contents, dependencies, update/removal lifetimes, and offline restart.
5. Packaging and recovery metadata; update contracts, author guides, and conceptual documentation after implementation establishes behavior.

Focused evidence must include:

- Independently built provider and two consumers sharing objects, classes, and a mutable ESM export within each realm; runtime/storage/public entries share the provider graph.
- A throwing consumer-private API copy is never selected, including when the real provider is disabled or fails storage admission.
- Public-only providers, duplicate ownership, separate realm dependency directions, and unchanged unrelated plugin artifacts when another plugin is built.
- CSS Module collision avoidance, public-entry styles, lazy chunks, worker/directory assets, and relocated package dependencies with import/require conditions.
- Local rebuild publication between preparation and runtime does not change the captured executable graph; later lazy imports use the captured build.
- npm installation failure/cancellation leaves selection unchanged; update keeps active old files; restart applies the exact selected version; uninstall does not remove user content.
- Actual installed Electron behavior, Windows paths/native dependencies, and production CSP. GUI acceptance belongs to the user, not automated launch-wait-kill loops.

Measure explicit build time separately from process launch, window availability, backend readiness, and frontend usability. The expected architectural gain is removal of startup transformation/rebundling; no end-to-end speedup percentage is established yet.

## Evidence and alternatives

Repository findings:

- `src/plugins/package-modules.ts` performs per-package preflight and final grouped builds; shared renderer compilation currently supplies CSS Module uniqueness.
- `src/plugins/packages.ts` already separates source-root selection, metadata, storage/runtime import, and availability; its npm source only resolves a conventional existing directory.
- `src/plugins/artifacts.ts`, `src/storage/application.ts`, and `src/plugins/startup.integration.test.ts` establish the preparation/runtime handoff. External dependencies/manuals are not complete byte snapshots today.
- `src/shared/renderer-modules.ts` and `src/renderer/modules/shared-modules.ts` identify actual host singleton consumers.
- `src/runtime/service.ts` and `src/renderer/features/plugins/PluginsSettings.tsx` implement local addition, bundled add-back, and restart-bound management, not npm installation.
- `electron-builder.config.ts` currently ships source package trees. The replacement must ship built builtin artifacts and complete required runtime dependencies.

External research, inspected on 2026-11-17, from mutable documentation/branches; no external installation was exercised:

- DeepSeek Harness plugin manager: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md
- Desktop carrier and bundled pnpm: https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md
- Plugin manager UI: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.md
- Optional plugin indexes: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md
- Prebuilt browser modules: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.md
- Node synchronous module hooks and their version/stability constraints: https://nodejs.org/api/module.html
- pnpm dependency build approval: https://pnpm.io/settings/build

DeepSeek Harness verifies the viability of bundled pnpm and an application-owned management UI. Its live HMR, profile composition, custom lazy-CJS browser module system, official-version coupling, and marketplace indexes are not adopted here. Its reviewed documentation does not independently establish every tarball-integrity guarantee.

Rejected directions: startup rebundling/relinking, runtime TS fallback, copying plugin public exports into global tables, ordinary consumer-local resolution for shared APIs, hand-written npm dependency installation, special builtin loading, and an implicit distinction between Git-checkout and published plugin lifecycles.

## Implementation disposition — 2026-11-17

Implemented in the working tree: the standalone `@asterism-app/plugin-build@0.1.0`, explicit multi-entry ESM artifacts, native host/provider resolution, immutable startup capture, builtin conversion, npm-managed installations and settings controls, recovery metadata, author examples, and release/packaging integration. Both SDK and builtin API examples reference the new package before its first npm publication, as authorized by the user.

A pinned pnpm 10.34.9 JavaScript distribution is used. Inspection showed that the newest major used a native launcher, and pnpm's registry view delegated to external npm. Script-free lockfile resolution supplies the exact-version preview instead. Actual Node and Electron Node-mode integration checks use an isolated local registry and an empty executable PATH; dependency-script blocking and explicit approval are exercised without a system Node/npm installation.

Independent review found two concrete defects: disjoint subpaths could split ownership of one public package, and a mixed public-only/renderer dependency cycle could bypass stylesheet admission. Both were corrected and regression cases added. Public ownership is package-wide; initialization cycles include ordered styles, while module-only cycles defer linking to ESM. A native-addon suffix misclassification was also corrected by resolving the actual file before deciding whether it is a `.node` binary.

The packaged shell serves its document through the existing application-owned protocol with a per-document nonce. Development Vite scripts and the import map share Vite's nonce. This replaces the temporary fixed-nonce approach without permitting arbitrary production inline scripts.

Validation includes application typechecks, the default unit suite, opt-in loader/installer/Electron integration checks, the builder's independent integration fixtures, example typechecks/builds, bilingual catalog checks, builder npm pack verification, and a macOS arm64 unpacked application build. The packaged builtin has been loaded by an actual Electron Node-mode harness; source-free public identities and physical pnpm distribution resolution were checked. Packaging includes only the selected builtin build, excludes builtin runtime source and the compiler package, and includes the bundled installer.

No application window was automated. Actual GUI installation/update/restart flows, browser import-map/CSP/worker behavior, Windows/Linux runtime behavior, and comparable end-to-end startup timings still require acceptance. The separate reported shutdown residual was not investigated or fixed. No commit, npm publication, push, release, or real-data cleanup was performed.

Final local checks: 1,639 default unit tests; 25 opt-in host/loader/installer/Electron integration tests; 9 standalone builder integration fixtures; backend/renderer typechecks; both author examples; complete English/Simplified Chinese catalogs; and the macOS arm64 unpacked build passed. The builder tarball contains compiled ESM and declarations and passed its pack file verification. Its local output is `.local/plugin-packages/asterism-app-plugin-build-0.1.0.tgz`; it has not been published.
