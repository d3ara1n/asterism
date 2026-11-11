# Runtime log rotation

Filed on 2026-11-10. Implementation completed on 2026-11-11; installed-application GUI acceptance remains pending. The problem and measurements below describe the pre-change implementation.

## Problem

At filing, `src/main/logging.ts` appended every aggregated record (main, renderer, child-process stdout/stderr) to a single `logs/runtime.log` via `appendFileSync` without rotation or truncation. `runtimeLogFile` in `src/shared/application.ts` named a fixed file. Production usage grows the file into the gigabyte range, which wastes disk, makes "latest log" inspection expensive, and slows startup-time reads if any occur.

The production file measured 1.85 MB / 5807 lines over 12 days of light use; heavier sessions (streaming stderr, warnings) scale it up considerably.

## Constraints

- Logging must remain available during storage failures (see `docs/development/architecture.md`); rotation must not introduce failure modes into the write path.
- The file is user-inspectable diagnostics ("Open logs" action); whatever scheme keeps recent records easily reachable.
- Retention policy and rotation trigger (size vs. startup vs. time) is a behavior decision to confirm with the user before implementing.

## Investigation

- [x] Decide rotation scheme: size-capped single file with truncation, rotated+renamed generations (`runtime.log.1` …), or per-startup files with a retention count.
- [x] Confirm the retention/size policy with the user.
- [x] Implement in `src/main/logging.ts` (and update `openLogsChannel` handling if the path becomes a directory view); keep the failure-path behavior intact.
- [x] Consider other unbounded writes: recovery directory growth remains separate and has no observed problem warranting work here.

## Approved resolution

The user selected Winston and asynchronous file logging on 2026-11-11. The confirmed implementation uses `winston@3.19.0` and `winston-daily-rotate-file@5.0.0`:

- Keep one main-process file transport for main diagnostics, renderer failures, and utility-process output, preserving the existing JSONL fields and source levels.
- Rotate by local calendar day and after the configured 20 MiB threshold. A record is not split to enforce an exact byte cap.
- Retain managed files for fifteen days through a fixed library audit file. Cleanup occurs when the library registers new files, not through an independent background service. This is an age policy, not a total-directory size cap.
- Write log contents through an asynchronous file stream. The library still uses synchronous filesystem operations for some initialization and rotation metadata; this is not an all-asynchronous filesystem implementation.
- Keep log file creation permissions at `0o600`. Keep existing main console output and report file logging failures directly to stderr without recursive logging or automatic retries.
- At final Electron `will-quit`, wait for observed child output and drain the logger and file stream. Do not close the logger during quit confirmation or runtime cleanup, so cancelled exits and update-installation failures retain logging until final exit.
- Keep the existing Open logs action, which already opens the directory.
- Preserve the old `runtime.log` as diagnostic evidence. It is not managed by the new retention policy and was not modified or deleted. No real-data cleanup is authorized by this implementation.

Synchronous writes were an early implementation choice, not a durability guarantee. An in-process asynchronous queue also cannot guarantee delivery after the main process is forcibly terminated. Normal shutdown completion and power-loss durability are different contracts.

## Validation

- `npm run typecheck` passed.
- Focused existing runtime-host and update tests passed: two files, five cases.
- `npm run build` passed, with the existing renderer chunk-size warning.
- An isolated temporary-directory integration check verified structured records, debug output, multiline renderer diagnostics, final unterminated child output, completed file writes, owner-only log permissions, and preservation of an existing legacy log. Temporary data was removed.
- A separate temporary-directory file-open failure check verified stderr reporting and completed logging shutdown without an unhandled file error. Temporary data was removed.
- The production dependency audit reported existing `exa-js`, `openai`, and `zod` advisories; none named the newly added logging dependencies. No unrelated dependency fixes were attempted.
- No tests were added for library configuration, field-list assembly, Electron event forwarding, or timing. GUI startup/shutdown was not automated.

## Remaining acceptance

- [ ] In an installed application, confirm the new files appear in Open logs and that ordinary quit, restart, and update handoff finish normally. GUI acceptance remains user-operated; no claim of installed-app acceptance is made here.
