# Storage evolution and recovery acceptance

Filed on 2026-10-12.

Version-based preparation, consecutive migrations, recovery points, isolated plugin storage entries, and plugin failure isolation are implemented and verified with isolated data. Installed-build and GUI acceptance is partly complete.

## Distribution baselines

No build has reached a user other than the maintainer. `v0.1.0-prerelease.1` (`52bddcc`) and `v1.0.0-prerelease.1` (`d81c5c7`) were maintainer test releases that validated the release, update, and distribution workflows; they establish no migration obligation.

The continuous n-to-n+1 obligation starts with the first build distributed to another user. Record that build and its format versions here when it ships. Until then, the plugin paradigm layering work can rebuild incompatible formats, and real development data cleanup still requires explicit authorization. Existing migration steps remain implementation evidence; whether to fold them into a fresh baseline is decided at that point.

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
- [x] A real format-changing installed update preserves sessions, attachments, settings, and plugin data. The user confirmed this acceptance; the exact version pair was not recorded.
- [x] Saved appearance is retained on a no-migration startup, without a window-size jump.
- [x] Transitional appearance and language during migration are correct, without a window-size jump.
- [x] The successful-migration notice appears once after Home appears.
- [x] Recovery-point listing, opening directories, retry, and native confirmations work.

## Remaining acceptance

- [ ] Use isolated data to verify an upgrade skipping intermediate app versions, preserving the same data categories. Use actual format steps rather than inventing production version changes for a demonstration.
- [ ] Verify migration from the earliest user-distributed baseline to the stable candidate.
- [ ] Restore and restart into paused recovery, then explicitly retry migration.
- [ ] Confirm the old data remains recoverable after starting with new data.
- [ ] Confirm one plugin's failed migration disables it while other features remain usable.

Earlier evidence included a development build migrating real development data 27 → 28 with an unreleased draft of the step. The `v0.1.0-prerelease.1` → `v1.0.0-prerelease.1` update had no migration path and remains evidence of application replacement and fresh start only. The subsequent user confirmation above establishes format-changing installed-update acceptance without assigning it to that earlier version pair.

Real development data was not used by automated verification. Failure and reset acceptance must also use isolated data; the accepted fresh start above was an incidental installed-build observation, not a planned isolated run.
