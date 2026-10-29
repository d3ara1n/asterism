# Release operations

Release operations preserve one explicit source commit, complete artifacts, and an accepted update/data path. Implementation completion and real installed acceptance are separate.

## Publish plugin development packages

The SDK and built-in public API are npm packages under the `@asterism-app` scope, published by the application Release workflow from the same source commit. The application and its internal implementation packages remain private npm workspaces.

Each package versions independently with semantic versioning. The baseline is the nearest published version whose recorded npm `gitHead` lies on the source's first-parent history. Commits after it that touch the package directory raise its version once by their highest level, using the application's commit rules: breaking raises major, features raise minor, and fixes/refactors raise patch. Commit scope does not matter. Without such commits the package keeps its published version and is not republished; an application release does not imply a package release. Source `package.json` versions are not authoritative; the workflow writes computed versions into the build and publication checkouts without committing them.

Distribution tags follow the application channels. A prerelease publishes changed packages under `next`; promotion builds the same commit, reuses the versions its prerelease published, and moves `latest` to them. Developers targeting the stable application install `@latest`, and those targeting the preview application install `@next`; each resolves to the packages matching that channel's newest application. Release notes list the matching package versions. Promotion fails when a package has changes its prerelease did not publish.

The SDK publishes before the built-in API, which declares it as a peer. A package's first publication is manual so that a registry baseline exists. Re-running a failed publish job skips versions already on npm.

The workflow authenticates through npm trusted publishing. For each package, register `release.yml` with publish permission and `promote.yml` with dist-tag permission; npm validates the calling workflow of a reusable workflow. Trusted publishing from a public repository generates provenance automatically.

## Prepare signing and repository access

The release repository is `d3ara1n/asterism`. Clients read public assets anonymously and contain no GitHub credentials.

Configure `MAC_SIGNING_P12` and `MAC_SIGNING_P12_PASSWORD` in Actions secrets. Use the same fixed macOS signing identity across releases. The workflow imports it into a temporary keychain and cleans up afterward.

Keep the private key outside the repository. Ordinary checks do not need signing secrets.

## Publish a prerelease

Integrate checked changes into main using Conventional Commits. The Release workflow checks for eligible new main commits on its schedule; a maintainer can also trigger it manually.

Both triggers use the same release computation. With no published baseline, the first target is `0.1.0`. Later runs skip before dependency installation when no release-triggering changes exist.

Each platform build uploads installers and update metadata as Actions artifacts. A single publication job runs after every platform succeeds, downloads the complete artifact set, and publishes the matching npm packages before creating a GitHub Release. macOS uses DMG and update ZIP, Windows uses NSIS, and Linux uses AppImage.

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

## Accept installed updates

Before sharing builds with users, verify consecutive installed versions on the actual distribution platforms: first install, model setup, a saved task, download, restart replacement, and retained data.

Check native helpers inside the installed artifact. macOS releases use a fixed self-signed identity. The native updater validates the new application against the installed application's designated requirement, which binds the application identifier and signing certificate hash. Users do not need to import the signing certificate. CI keychain trust supports signing on the build machine.

Gatekeeper first-launch checks are separate from update signature continuity. Verify first launch and updating on an ordinary user installation; an ad-hoc local package does not validate the fixed-certificate update path.

Verify stable/prerelease selection without downgrade and a real format-changing update with recovery. Use isolated data and representative migration fixtures.

First user distribution establishes continuous data compatibility, including prereleases shared with friends. Pending GUI and platform acceptance stays in its plan; a successful implementation commit is not acceptance evidence.
