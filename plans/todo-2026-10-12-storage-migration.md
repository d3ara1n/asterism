# Storage evolution and recovery acceptance

Filed on 2026-10-12.

Version-based preparation, consecutive migrations, recovery points, isolated plugin storage entries, and plugin failure isolation are implemented and verified with isolated data. Installed-build and GUI acceptance is partly complete.

## User-distributed baselines

Prereleases are shared with a small group of friends, so continuous n-to-n+1 migrations apply from these baselines onward.

- First user-distributed build: `v1.0.0-prerelease.1`, from `d81c5c7f7cb9c601c6ee7961b8c1b585a6880544`.
- Baselines: workspace SQLite 27, configuration 11, plugin package list 1, appearance/language/update preferences 1, built-in plugin config 1.
- `v0.1.0-prerelease.1` (`52bddcc`, workspace 26) only tested the release workflow itself and had no users; there is no migration path from it.
- Workspace format 28 adds the first user-facing migration step (27 → 28).

## Implemented

- [x] Host persistent formats declare versions; missing files remain uncreated during preparation.
- [x] JSON replacement is atomic and SQLite migration chains are transactional.
- [x] Missing, newer, or unreachable versions fail before conversion.
- [x] Plugin storage preparation avoids importing ordinary plugin runtime and isolates plugin failure.
- [x] Recovery points preserve the data group, retain recent complete points, and share immutable bytes where supported.
- [x] Restore/reset preserves current data, resumes interrupted work, and pauses automatic migration after restoration.
- [x] Isolated tests cover migration, retention, reuse, recovery resumption, and failure isolation.

## Accepted

- [x] A failed preparation in an installed build starts with new data: the first use of an installed build found leftover incompatible development-era data, failed preparation, and started normally with new data.

## Remaining acceptance

- [ ] Use isolated data to verify a real format-changing installed update and an upgrade skipping intermediate app versions. Preserve sessions, attachments, settings, and plugin data without inventing production version changes for a demonstration. Evidence so far: a development build migrated real development data 27 → 28 with an unreleased draft of the step. The `v0.1.0-prerelease.1` → `v1.0.0-prerelease.1` update had no migration path, so no installed update has retained data across a format change yet; the next prerelease carrying 27 → 28 is the first candidate.
- [ ] Verify migration from the earliest user-distributed baseline to the stable candidate.
- [ ] Verify saved appearance on a no-migration startup and transitional appearance/language during migration, without a window-size jump.
- [ ] Verify the one-time successful-migration notice after Home appears.
- [ ] Exercise recovery-point listing, opening directories, retry, and native confirmations.
- [ ] Restore and restart into paused recovery, then explicitly retry migration.
- [ ] Confirm the old data remains recoverable after starting with new data.
- [ ] Confirm one plugin's failed migration disables it while other features remain usable.

Real development data was not used by automated verification. Failure and reset acceptance must also use isolated data; the accepted fresh start above was an incidental installed-build observation, not a planned isolated run.
