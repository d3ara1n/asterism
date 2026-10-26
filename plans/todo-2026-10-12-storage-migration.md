# Storage evolution and recovery acceptance

Filed on 2026-10-12.

Version-based preparation, consecutive migrations, recovery points, isolated plugin storage entries, and plugin failure isolation are implemented and verified with isolated data. Installed-build and GUI acceptance remains pending.

## Implemented

- [x] Host persistent formats declare versions; missing files remain uncreated during preparation.
- [x] JSON replacement is atomic and SQLite migration chains are transactional.
- [x] Missing, newer, or unreachable versions fail before conversion.
- [x] Plugin storage preparation avoids importing ordinary plugin runtime and isolates plugin failure.
- [x] Recovery points preserve the data group, retain recent complete points, and share immutable bytes where supported.
- [x] Restore/reset preserves current data, resumes interrupted work, and pauses automatic migration after restoration.
- [x] Isolated tests cover migration, retention, reuse, recovery resumption, and failure isolation.

## Remaining acceptance

- [ ] Use isolated data to verify a real format-changing installed update and an upgrade skipping intermediate app versions. Preserve sessions, attachments, settings, and plugin data without inventing production version changes for a demonstration.
- [ ] Verify saved appearance on a no-migration startup and transitional appearance/language during migration, without a window-size jump.
- [ ] Verify the one-time successful-migration notice after Home appears.
- [ ] Exercise recovery-point listing, opening directories, retry, and native confirmations.
- [ ] Restore and restart into paused recovery, then explicitly retry migration.
- [ ] Start with new data and confirm the old data remains recoverable.
- [ ] Confirm one plugin's failed migration disables it while other features remain usable.

Real development data was not used by automated verification. Failure and reset acceptance must also use isolated data.
