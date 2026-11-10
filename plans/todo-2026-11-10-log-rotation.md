# Runtime log rotation

Filed on 2026-11-10. The aggregated runtime log grows without bound; no rotation exists yet.

## Problem

`src/main/logging.ts` appends every aggregated record (main, renderer, child-process stdout/stderr) to a single `logs/runtime.log` via `appendFileSync` and never rotates or truncates. `runtimeLogFile` in `src/shared/application.ts` names a fixed file. Production usage grows the file into the gigabyte range, which wastes disk, makes "latest log" inspection expensive, and slows startup-time reads if any occur.

Current production file measured 1.85 MB / 5807 lines over 12 days of light use; heavier sessions (streaming stderr, warnings) scale it up considerably.

## Constraints

- Logging must remain available during storage failures (see `docs/development/architecture.md`); rotation must not introduce failure modes into the write path.
- The file is user-inspectable diagnostics ("Open logs" action); whatever scheme keeps recent records easily reachable.
- Retention policy and rotation trigger (size vs. startup vs. time) is a behavior decision to confirm with the user before implementing.

## Investigation

- [ ] Decide rotation scheme: size-capped single file with truncation, rotated+renamed generations (`runtime.log.1` …), or per-startup files with a retention count.
- [ ] Confirm the retention/size policy with the user.
- [ ] Implement in `src/main/logging.ts` (and update `openLogsChannel` handling if the path becomes a directory view); keep the failure-path behavior intact.
- [ ] Consider the same treatment for other unbounded writes if any (recovery directory growth is a separate concern; not observed as a problem yet).
