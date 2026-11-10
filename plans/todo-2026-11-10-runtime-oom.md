# Task runtime OOM and long-lived runtime termination

Filed on 2026-11-10 after the installed release (1.0.0-prerelease.16) lost its task runtime with a V8 heap OOM. Not yet investigated.

## Evidence

Production log `~/Library/Application Support/dev.dearain.asterism/logs/runtime.log` and crash report `~/Library/Logs/DiagnosticReports/Asterism Helper-2026-11-10-160216.ips` (system may purge the report; key facts copied here):

- 2026-11-10 16:02:10 — runtime process (Asterism Helper, pid 1266) died with `OOM error in V8: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`. Exception EXC_BREAKPOINT (SIGTRAP), faulting frame `fapi::v8::internal::V8::FatalProcessOutOfMemory`.
- The process had been running since 2026-11-07 00:25 (~3.6 days) before the OOM, suggesting slow accumulation rather than a single large allocation.
- Main then set `status: failed, reason: 'runtime', detail: 'The task runtime has stopped.'`; the renderer reported `Interface failure. stage=startup The task runtime has stopped.` — the user-visible "backend connection lost / service unavailable" state.
- Three earlier stops exist in the same log, all `Task runtime stopped responding and was terminated` (watchdog) with no OOM line captured:
  - 2026-10-29 09:02, runtime uptime ~4.7 min (pid 86269, started 08:58 same day)
  - 2026-10-29 13:58, runtime uptime ~4.9 days (pid 86657)
  - 2026-11-02 23:56, runtime uptime ~10.4 days (pid 9398)

## Hypotheses

- A leak or unbounded accumulation in the long-lived runtime process (history records, message buffers, subscriptions, caches) that eventually exhausts the V8 heap. The default helper heap limit applies; nothing raises `--max-old-space-size`.
- The watchdog terminations may share the root cause: memory pressure can present as unresponsiveness (GC thrash) before an actual OOM. The 4.7-minute stop looks different and may be unrelated.

## Investigation

- [ ] Reproduce with a long-lived runtime under streaming load; watch helper RSS/heap over days (`process.memoryUsage`, heap snapshots at intervals).
- [ ] Diff heap snapshots to find retaining allocations; review runtime-side stores that grow with activity (records, transcripts, observed stores, event subscriptions).
- [ ] Determine whether the watchdog terminations correlate with memory growth (their runtime.log context shows no OOM line — check whether stderr was captured at all).
- [ ] Decide remediation separately from the cause: leak fix vs. heap limit vs. runtime restart policy. Raising limits or auto-restarting without understanding the leak only masks it.
