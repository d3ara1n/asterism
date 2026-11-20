# Release operations

Release operations preserve one explicit source commit, complete artifacts, and an accepted update/data path. Implementation completion and real installed acceptance are separate.

## Publish plugin development packages

The SDK, built-in public API, and standalone plugin artifact builder are npm packages under the `@asterism-app` scope, published by the application Release workflow from the same source commit. The application and its internal implementation packages remain private npm workspaces.

The root package manifest owns the ordered public-package catalogue and its release-input format. Collection reads that declaration from the selected source commit. Candidates predating this explicit artifact release flow are rejected; promotion does not adapt historical package layouts or omit missing packages.

Each package versions independently with semantic versioning. The baseline is the nearest published version whose recorded npm `gitHead` lies on the source's first-parent history. Commits after it that touch the package directory raise its version once by their highest level, using the application's commit rules: breaking raises major, features raise minor, and fixes/refactors raise patch. Commit scope does not matter. Without such commits or changed release-paired example dependencies, the package keeps its published version and is not republished; an application release does not imply a package release. Source `package.json` versions are not authoritative; the workflow writes computed versions into the build and publication checkouts without committing them.

Complete examples target the public-package versions selected for their containing application release. The version writer stamps their development dependencies, including self-pins, while retaining compatibility peer ranges and ordinary dependencies. The planner compares each owner's example dependencies with the publications paired at that owner's baseline source. A changed pairing adds a patch release unless direct changes already require publication, and propagates through the catalogue in dependency order. This comparison uses source history rather than a dependency's pending publish flag, so an interrupted publication can resume without missing downstream example changes. A new public dependency with no earlier pairing also establishes a new example release. The catalogue orders these dependencies before consumers.

Distribution tags follow the application channels. A prerelease publishes changed packages under `next`; promotion builds the same commit, reuses the versions its prerelease published, and moves `latest` to them. Developers targeting the stable application install `@latest`, and those targeting the preview application install `@next`; each resolves to the packages matching that channel's newest application. Release notes list the matching package versions. Promotion fails when a package has changes its prerelease did not publish.

The artifact builder publishes before the authoring packages; the SDK publishes before the built-in API, which declares it as a peer. Changed-package publication installs dependencies once; emitting packages own their build through `prepack`. A dist-tag-only promotion does not install or build the authoring tool. A package's first publication is manual so that a registry baseline exists. Re-running a failed publish job reuses an existing version only when its recorded `gitHead` matches the selected publication source. A missing or different source fails explicitly. Initial manual publication should use committed package inputs; a `gitHead` recorded from a dirty checkout does not identify its uncommitted contents.

The workflow authenticates through npm trusted publishing. For each package, register `release.yml` with publish permission and `promote.yml` with dist-tag permission; npm validates the calling workflow of a reusable workflow. Trusted publishing from a public repository generates provenance automatically.

## Prepare signing and repository access

The release repository is `d3ara1n/asterism`. Clients read public assets anonymously and contain no GitHub credentials.

Configure `MAC_SIGNING_P12` and `MAC_SIGNING_P12_PASSWORD` in Actions secrets. Use the same fixed macOS signing identity across releases. The workflow imports it into a temporary keychain and cleans up afterward.

Keep the private key outside the repository. Ordinary checks do not need signing secrets.

## Configure crash reporting

Error and crash reporting is opt-in. The main process assigns the Sentry environment: unpackaged development and preview runs use `development`, and packaged builds, including locally built installers, use `production`. Both use the same project and public DSN. Use the Environment filter in Sentry to view production issues without development events.

Set `SENTRY_AUTH_TOKEN` in GitHub Actions to enable source map uploads to `gravitylab/asterism`. The release workflow injects matching debug IDs and uploads source maps before packaging; installers exclude the maps. Without the secret the workflow skips upload and still packages the app. The token belongs only in CI, never in a local build or in application code.

## Publish a prerelease

Integrate checked changes into main using Conventional Commits. The Release workflow checks for eligible new main commits on its schedule; a maintainer can also trigger it manually.

Both triggers use the same release computation. Collection records inputs outside the checkout, then preparation checks out the selected source before installing dependencies, writing planned versions, and running checks. CI and release preparation share `npm run check`; release preparation also explicitly runs the separate plugin build/load integration suite. With no published baseline, the first target is `0.1.0`. Later runs skip before dependency installation when no release-triggering changes exist.

The real installer smoke test is separate: run `npm run test:plugin-install` when changing the bundled pnpm launcher or dependency-script approval. It uses Electron in Node mode with a loopback registry and disposable configuration, caches, and installation files. It is not a release gate; deterministic installer tests remain part of the ordinary checks.

Each platform build uploads installers and update metadata as Actions artifacts. A single publication job runs after every platform succeeds, downloads the complete artifact set, and publishes the matching npm packages before creating a GitHub Release. macOS uses DMG and update ZIP, Windows uses NSIS, and Linux uses AppImage.

Release assets use fixed platform and architecture names, such as `Asterism-mac-arm64.dmg`, without a version in the filename. The release tag, application metadata, and updater metadata retain the version. The website recommends only the latest stable release through GitHub’s `/releases/latest/download/` links, so publishing does not require a website deployment. A candidate promoted to stable must include the fixed-name packaging configuration; promotion builds the candidate’s source, not the current main checkout.

Application builds reject test sources and Vitest in runtime module graphs. Bundled plugins are explicitly built before host packaging. Their completed output and package metadata are distributed without sources; example build outputs are excluded. Before signing, packaging verifies bundled artifact entries, that each declared runtime dependency resolves from the packaged tree, and declared manual directories, including those of provided public libraries. These checks inspect compiled inputs and packaged files; they do not establish GUI acceptance.

The final publication step creates a draft, uploads all assets, and makes the release public only after upload succeeds. On failure it attempts to remove only the draft created by that step; it preserves published releases. GitHub and npm do not share a transaction, so npm packages can already be published if a later GitHub operation fails.

## Compute versions and notes

Use main’s first-parent commits, including direct commits and squash results. Version impact, publication eligibility, and note inclusion are separate classifications.

Breaking changes raise major, features raise minor, and fixes/refactors raise patch. Maintenance commits can appear in the next eligible release notes without triggering a release by themselves.

Published, non-draft release tags on the selected history establish baselines. An unpublished tag does not. The first target is fixed regardless of earlier development breaking changes.

After that baseline, apply the highest impact once across the accumulated range. Repeated candidates for one target increment the prerelease ordinal; a new target starts its ordinal again. Already published commits do not become new merely because an older candidate is later promoted.

Prerelease notes cover new commits since the latest applicable published release. Stable notes cover the whole range since the previous stable release through the promoted commit. Deduplicate by commit SHA.

Each category displays its latest 20 commits at most. Categories with additional commits show the omitted count and direct readers to the Full Changelog link. Version calculation and publication eligibility use the complete commit range.

## Promote a candidate

Run Promote Release with a tested prerelease tag. The workflow builds that exact commit and removes its prerelease suffix.

The resulting stable version must exceed existing stable releases. For one target version, select its latest candidate so a newer prerelease installation does not receive older code as stable.

Promotion does not require a new main commit and does not include later main changes. A failed build creates no release. If publication cleanup cannot reach GitHub or the runner is terminated before cleanup, inspect any remaining draft before retrying; manual remote cleanup requires explicit authorization.

## Assemble the desktop payload

The desktop Node bundles and the built-in plugin report external package imports as build output. The release includes those roots and their installed npm dependency closure, rather than the entire development workspace. Browser bundles contribute assets, not copies of their npm source packages. Runtime consumers that launch an OS tool or publish manuals own those inputs separately.

The bundled plugin resolves imports through `app.asar`, like the desktop host. Only native packages detected by electron-builder and inputs that an OS process uses as real paths, such as command launchers and searchable manuals, are unpacked. Keep public examples as authored content. Do not introduce per-library pruning rules to reduce the size of a release.

## Accept installed updates

Before sharing builds with users, verify consecutive installed versions on the actual distribution platforms: first install, model setup, a saved task, download, restart replacement, and retained data.

On Windows, accept both a current-user and an all-users in-app update, including an existing custom installation path. The updater should keep the registered scope and path, show installation progress, and relaunch without a completion prompt. All-users updates may request UAC. Opening the Setup EXE directly still uses the assisted wizard.

Check native helpers inside the installed artifact. macOS releases use a fixed self-signed identity. The native updater validates the new application against the installed application's designated requirement, which binds the application identifier and signing certificate hash. Users do not need to import the signing certificate. CI keychain trust supports signing on the build machine.

Gatekeeper first-launch checks are separate from update signature continuity. Verify first launch and updating on an ordinary user installation; an ad-hoc local package does not validate the fixed-certificate update path.

Verify stable/prerelease selection without downgrade and a real format-changing update with recovery. Use isolated data and representative migration fixtures.

First user distribution establishes continuous data compatibility, including prereleases shared with friends. Pending GUI and platform acceptance stays in its plan; a successful implementation commit is not acceptance evidence.
