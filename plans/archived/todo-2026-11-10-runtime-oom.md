# Task runtime OOM and runtime termination

Filed on 2026-11-10 after the installed release (1.0.0-prerelease.16) lost its task runtime with a V8 heap OOM. Closed and archived on 2026-11-11 after a local closed-lease retention defect was identified, repaired, and checked against a restarted development capture. The original installed crash has no heap snapshot, so exclusive attribution of that OOM remains unproven.

## Diagnostic tooling retirement

On 2026-11-11, the user retired the temporary Inspector startup entry, collector client, and their tests and usage documentation after completing the investigation. The commands and capture workflow below describe historical tooling, not current application capabilities. The closed-lease retention fix, application logging, and utility-process fatal-report capture remain in place. Existing exit logs showed one 4426 ms shutdown waiting for an attached debugger to disconnect; subsequent exits after debugger disconnection completed in 14–26 ms. No unconditional test delay was found in the exit path.

## Evidence

Production log: `~/Library/Application Support/dev.dearain.asterism/logs/runtime.log`. The original crash report was `~/Library/Logs/DiagnosticReports/Asterism Helper-2026-11-10-160216.ips`; it was no longer present when checked on 2026-11-11. The copied crash facts below remain historical evidence.

- 2026-11-10 08:02:10 UTC (16:02:10 +08:00): runtime process (Asterism Helper, pid 1266) died with `OOM error in V8: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`. The original report identified EXC_BREAKPOINT (SIGTRAP) and the faulting frame `fapi::v8::internal::V8::FatalProcessOutOfMemory`.
- The process started on 2026-11-06 16:25:31 UTC (2026-11-07 00:25:31 +08:00), approximately 3.65 days earlier. Uptime alone does not distinguish gradual accumulation from a late allocation spike.
- The retained stderr contains two last-resort Mark-Compact collections: `3740.8 -> 3740.7 MB` and `3740.7 -> 3740.7 MB`. The process exited with code 5. This establishes a large retained V8 heap at failure, not its cause.
- Main then set `status: failed, reason: 'runtime', detail: 'The task runtime has stopped.'`; the renderer reported `Interface failure. stage=startup The task runtime has stopped.`
- Three earlier stops exist in the same log, all `Task runtime stopped responding and was terminated` (watchdog), without an OOM line:

| Stop time (UTC) | Runtime PID | Runtime uptime |
| --- | --- | --- |
| 2026-10-29 09:02:57 | 86269 | Approximately 4.7 minutes |
| 2026-10-29 13:58:05 | 86657 | Approximately 4.9 hours |
| 2026-11-02 23:56:53 | 9398 | Approximately 10.5 hours |

The original filing mislabeled the latter two uptimes as days. These values were corrected against spawn timestamps and logged elapsed milliseconds on 2026-11-11. Stderr was captured for those process lifetimes. Their relationship to OOM remains unestablished; runtime heartbeat and request deadlines were removed on 2026-11-03 (`128e48cf`). Current runtime supervision retains a startup deadline, not a running-process heartbeat.

## Hypotheses

- Long-lived references, unbounded working data, or an unusually large active request may exhaust the JS heap. There is no memory trend or heap snapshot from the incident to distinguish them yet.
- Historical watchdog terminations may involve GC pressure, synchronous blocking, or other causes. Keep them separate from the confirmed OOM unless new evidence connects them.
- Current code uses the helper's default heap limit; no runtime `--max-old-space-size` override is configured. Measure the actual limit rather than assuming its value.

## Report preservation

- [x] Save fatal-error reports supplied by Electron's UtilityProcess `error` event before later supervision handlers terminate the child, for both task runtime and data preparation.
- [x] Keep each original report in its own owner-only JSON file under the application data root's `diagnostics/` directory, separately from log rotation. Logs identify source, PID, failure type/location, and path. Report-write failure remains visible without interrupting supervision.
- [ ] Verify delivery for a real V8 fatal/OOM path in a disposable local build. Unit checks cover persistence, separate reports, and write-failure handling; they do not establish that Electron emits a report for every termination.

Reports remain local and are not automatically removed. They can contain sensitive environment/runtime data. No automatic remote reporting or heap-snapshot upload is enabled.

## Local collection and next investigation

Use existing Electron/V8 tools before adding business-level counters. The repository currently uses Electron 45.1.0.

1. Start the development application with `npm run dev:diagnostics`, then attach the independent collector with `npm run diagnose:runtime` after the task runtime is ready. The explicit `--inspect-runtime=<port>` flag binds the task process to `127.0.0.1`; packaged applications ignore it. No inspector is enabled in normal development launches.
2. The collector saves memory/process counters every five seconds and live sampled allocation profiles after the first memory sample and then every two minutes by default. New capture directories are created under ignored `.local/runtime-diagnostics/`. It exports a Perfetto-readable memory/CPU counter trace alongside incrementally written NDJSON, profiles, identity/settings, and lifecycle events. It reads Node process counters over Inspector, so a blocked target can delay them; this is not an independent OS memory monitor or a full GC trace.
3. Enter `snapshot` in the collector terminal for an explicit complete heap snapshot, or `profile` for an allocation checkpoint. Take a warmed-up baseline, run a fixed batch of requests, wait for completion, and compare successive snapshots' retained sizes and retaining paths. Snapshots stream to `.partial` files until complete. No automatic near-OOM snapshot or forced GC is configured.
4. Separate idle behavior, repeated fixed-size requests, growth of one conversation, and session switching/sleep. Use isolated temporary data and a deterministic local stream source where possible before spending days with live providers.
5. If a cross-process memory/GC timeline is needed, use `contentTracing` with selected V8 and MemoryInfra categories, export a Perfetto trace, and first verify which counters the Node utility process actually contributes. Electron 45 exports protobuf traces; older JSON/`enableHeapProfiling` examples do not describe this version's API. `nativeHeapProfiling` samples C/C++ allocations, not JS object retention.

`stop`, Ctrl+C, target disconnection, or a collection failure ends the local recorder without retrying or following another process. Already completed samples and checkpoints remain; stopping does not wait for another final profile. Normal collector cleanup finalizes the counter trace, while forced collector termination may leave that trace incomplete. Completed NDJSON lines and profiles remain independently usable. This has no power-loss durability guarantee.

The implementation has focused checks for flag/interval parsing, CPU delta calculation, Inspector request correlation/failure, and complete versus interrupted snapshot persistence.

An isolated Node 26.13.0 Inspector exercise on 2026-11-11 verified target PID attribution, memory samples, periodic profile checkpoints, a parseable requested heap snapshot, clean `stop`/SIGTERM trace finalization, target-death failure with prior artifacts retained, and an interrupted snapshot kept only as `.partial`. Reattaching after collector shutdown showed allocation sampling had stopped. Temporary targets and artifacts were cleaned up; Electron was not launched. The target was idle, so this did not verify meaningful allocation-workload attribution. Subsequent user captures exercised the recorder on Electron 45.1.0 as described below. Minimum-supported Node 22.13 execution, DevTools/Perfetto acceptance, and the original OOM attribution remain unverified.
Heap snapshots pause execution and can require substantial extra memory. Do not wait for near-OOM to take the first snapshot. Keep snapshots, profiles, and traces outside the repository; inspect sensitive contents before sharing. GUI debugging and workload acceptance remain manual.

## Local heap evidence and listener fix (2026-11-11)

The user supplied a 62-minute capture in `.local/runtime-diagnostics/2026-11-11T02-04-32.735Z-NvNKo4/` and a later capture in `.local/runtime-diagnostics/2026-11-11T03-18-28.038Z-eJSEGD/`. Both identify task runtime PID 39473. Each contains its own `snapshot-0001.heapsnapshot`; the second file did not overwrite the first. Snapshot comparisons used structural counts and root paths, not an assumption that object IDs survive Inspector reconnection.

- The hour-long capture contains 747 memory samples and 32 allocation profiles. JS heap usage rose from approximately 61 to 106 MiB, with a 125 MiB peak and intervening stable plateaus. The last allocation profile estimates 48.11 MiB of sampled allocations, dominated by `structuredClone` (28.43 MiB) and `toRecord` (8.32 MiB). Allocation stacks alone did not identify their retainers.
- At the first explicit snapshot, RSS jumped from approximately 244 to 1246 MiB while JS heap usage slightly decreased. This is recording-related memory pressure, not evidence of a business/native leak by itself.
- The later snapshot contains 86 content leases, all closed, versus one in the earlier snapshot. Their content refs, pending operations, and readers were empty; none remained registered in the content store's lease map, and the handover map was empty. It also contains 13 response buffers, all finalized, versus none earlier.
- Forty-two cancellation Listener objects have callback locations matching the anonymous callback in `src/plugins/sdk/objects.ts`'s `linkAbort`. Verified nonweak paths lead from Node's `gcPersistentSignals` set through those listeners to closed leases. Normal-close abort reasons retain internal error stacks, which in turn reach dispatchers, capabilities, request messages, and captured history views. These paths do not depend on WeakMap ephemeron pseudoedges or code-allocation boilerplates.
- Total snapshot-node shallow size grew from approximately 67.90 to 236.61 MiB; string shallow size grew from 35.97 to 194.74 MiB. These are not exclusive dominator sizes, and the entire increase is not attributed to this one defect. The original installed OOM remains a separate attribution question.

The confirmed defect was an upstream abort listener registered with `once: true` but no lease-lifetime cleanup. Successful lease completion aborts the lease controller, not the upstream signal, so the upstream listener could continue holding completed execution state.

The fix binds that registration to the lease controller using the standard EventTarget listener `signal` option. Lease close now removes the upstream listener; active upstream cancellation still aborts its lease, without cancelling callers or sibling leases. The helper is module-scoped and tested at its owning boundary. No cache policy, history semantics, heap limit, forced GC, or restart policy changed.

Focused regression checks failed against the old implementation for listener retention after close and late binding to a closed lease, then passed after the fix. They also cover active sibling cancellation and an already cancelled caller. They inspect registrations directly rather than depending on GC or timing. The restarted development capture below checks the repaired root against actual use; broader idle-state and long-duration acceptance limits remain explicit.

## Fixed-build capture and disposition (2026-11-11)

The user restarted the development application and captured `.local/runtime-diagnostics/2026-11-11T05-54-34.751Z-UevjvM/` from PID 51336. Both saved snapshots contained the fixed runtime source with the lease-controller listener signal option. They were taken approximately 99 minutes apart.

- The second fixed-build snapshot contained two closed content leases instead of 86 in the older unfixed snapshot, and no finalized response buffers instead of 13. The old direct lease-capturing cancellation listeners were absent.
- The two response buffers present were not finalized. Checked nonweak paths, excluding WeakMap ephemeron pseudoedges, led through current stream/progress work rather than the old stale-listener chain. The two closed leases also had current execution-object/callback paths rather than that chain. This was not a fully idle snapshot.
- Allocation-sampling estimates fell as well as rose: approximately 64 to 31 MiB in one interval and 80 to 37 MiB in a later interval. JS heap low values were approximately 72 MiB during part of minutes 60–80. This supports release of transient work; it is not a requirement that legitimate history and cache growth return to startup size.
- JS heap usage immediately after the second snapshot was approximately 94 MiB. The early baseline was approximately 43 MiB, before later history indexes and code caches were populated, so this difference is not assigned entirely to leakage.
- Snapshot recording again inflated RSS: approximately 340 MiB before the second snapshot and 1401 MiB after it. During minutes 60–80 the RSS median was approximately 259 MiB. No clean, uninstrumented restarted baseline was captured, and neither a residual native leak nor ordinary 1.3 GiB usage is established by the profiled RSS.

Disposition: the specific listener-lifetime leak passed focused regression checks and did not recur in the supplied fixed-build snapshots. End the concentrated investigation with the development-only recorder, instructions, tests, and fatal-report preservation retained. This is not a claim that every possible memory issue or the original OOM's complete cause has been proven absent.

The user authorized removal of the entire repository `.local/` directory on 2026-11-11. The active external collector was stopped through SIGTERM and recorded a normal `ended` / `stopped` event before deletion. Approximately 519 MiB of disposable diagnostic artifacts and older build/test logs were removed. The application data root, sessions, configuration, and source/test files were not part of that cleanup. Capture paths in this record identify historical evidence that is no longer available locally; this summary preserves the measured results without conversation or credential contents.

## Investigation completion

- [x] Identify a concrete strong retaining path to closed leases and completed execution captures in the supplied local snapshots.
- [x] Repair the cancellation-registration lifetime and verify listener release and cancellation behavior with focused regressions.
- [x] Compare a restarted fixed-build baseline with a snapshot approximately 99 minutes later and confirm the identified listener root no longer accumulates completed request state. The supplied later snapshot still included active work; it was not a full three-stage idle workload comparison.

Acceptance caveats retained at closure:

- Real V8 fatal/OOM report delivery, minimum-supported Node 22.13 execution, and DevTools/Perfetto viewer acceptance were not verified by this investigation.
- No fully idle third fixed-build snapshot, multi-day repeat, or clean uninstrumented RSS baseline was supplied. Exclusive attribution of the original installed OOM remains unproven.
- Heap limits and restart policy were not changed. The repaired reference lifetime, not a larger heap or automatic restart, is the disposition of the confirmed defect.
- A new observed regression should start a new investigation record rather than reopening or overwriting this historical evidence.

## Working references

- https://www.electronjs.org/docs/latest/api/utility-process
- https://www.electronjs.org/docs/latest/api/content-tracing
- https://nodejs.org/en/learn/diagnostics/memory/using-heap-profiler
- https://nodejs.org/en/learn/diagnostics/memory/using-heap-snapshot
