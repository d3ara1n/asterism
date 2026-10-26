# Release operations

Release operations preserve one explicit source commit, complete artifacts, and an accepted update/data path. Implementation completion and real installed acceptance are separate.

## Prepare signing and repository access

The release repository is `d3ara1n/asterism`. Clients read public assets anonymously and contain no GitHub credentials.

Configure `MAC_SIGNING_P12` and `MAC_SIGNING_P12_PASSWORD` in Actions secrets. Use the same fixed macOS signing identity across releases. The workflow imports it into a temporary keychain and cleans up afterward.

Keep the private key outside the repository. Ordinary checks do not need signing secrets.

## Publish a prerelease

Integrate checked changes into main using Conventional Commits. The Release workflow checks for eligible new main commits on its schedule; a maintainer can also trigger it manually.

Both triggers use the same release computation. With no published baseline, the first target is `0.1.0`. Later runs skip before dependency installation when no release-triggering changes exist.

The workflow builds target installers and metadata, uploads a draft, and publishes only after all assets succeed. macOS uses DMG and update ZIP, Windows uses NSIS, and Linux uses AppImage.

## Compute versions and notes

Use main’s first-parent commits, including direct commits and squash results. Version impact, publication eligibility, and note inclusion are separate classifications.

Breaking changes raise major, features raise minor, and fixes/refactors raise patch. Maintenance commits can appear in the next eligible release notes without triggering a release by themselves.

Published, non-draft release tags on the selected history establish baselines. An unpublished tag does not. The first target is fixed regardless of earlier development breaking changes.

After that baseline, apply the highest impact once across the accumulated range. Repeated candidates for one target increment the prerelease ordinal; a new target starts its ordinal again. Already published commits do not become new merely because an older candidate is later promoted.

Prerelease notes cover new commits since the latest applicable published release. Stable notes cover the whole range since the previous stable release through the promoted commit. Deduplicate by commit SHA.

## Promote a candidate

Run Promote Release with a tested prerelease tag. The workflow builds that exact commit and removes its prerelease suffix.

The resulting stable version must exceed existing stable releases. For one target version, select its latest candidate so a newer prerelease installation does not receive older code as stable.

Promotion does not require a new main commit and does not include later main changes. A failed build remains unpublished. Inspect and remove an incomplete draft before retrying a failed upload, with separate authorization for remote writes.

## Accept installed updates

Before sharing builds with users, verify consecutive installed versions on the actual distribution platforms: first install, model setup, a saved task, download, restart replacement, and retained data.

Check native helpers inside the installed artifact. On macOS, use an environment without the developer certificate installed; an ad-hoc local package does not validate the fixed-certificate update path.

Verify stable/prerelease selection without downgrade and a real format-changing update with recovery. Use isolated data and representative migration fixtures.

First user distribution establishes continuous data compatibility, including prereleases shared with friends. Pending GUI and platform acceptance stays in its plan; a successful implementation commit is not acceptance evidence.
