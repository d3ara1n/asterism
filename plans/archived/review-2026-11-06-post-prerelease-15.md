# Review: changes after v1.0.0-prerelease.15

Filed: 2026-11-06
Status: Findings addressed after user decisions; implementation and validation recorded below.

## Scope and method

Baseline: `v1.0.0-prerelease.15` at `6f2dc59e`. GitHub lists it as a published, non-draft prerelease, published at 2026-11-06T05:37:58Z. Reviewed head: `11ddd961` on `main`.

The range contains 17 commits and changes 142 files, with 2,289 additions and 568 deletions. The initial working tree was clean. The initial review changed no implementation or tests; the follow-up disposition below records the subsequently authorized changes.

Four reviewers worked independently by ownership boundary:

1. Runtime lifecycle, sleep, deadlines, schedules, storage, and configuration migration.
2. Application commands, plugin command composition, and session naming.
3. UI navigation, Island retention and cancellation, docks, sidebar preferences, and question review flow.
4. Model discovery, resource restriction discovery/enforcement, plugin capabilities, and SDK wiring.

The coordinating review checked cross-slice contracts, verified findings against current source, independently reproduced the sleep failure loop, and ran integration validation. The review considered correctness, unnecessary defensive mechanisms, duplicated policy, abstraction value, and test ownership. It did not treat hypothetical interleavings or aesthetic preferences as defects.

## Findings

### R1 — P2: Failed automatic sleep immediately schedules the same overdue session again

Introduced by: `a646cc00`.

Locations:

- `src/runtime/session-sleep.ts:39–46,55–61`
- `src/runtime/sessions.ts:707–724`
- `src/runtime/deadline-scheduler.ts:15`

`SessionSleepPolicy.fire()` logs rejected `sleep()` operations and unconditionally calls `refresh()`. A failed session can remain running, settled, and overdue. For example, resource release can finish but the subsequent `tree.sleep()` database write can fail. The deactivation entry is removed in `finally`, making the session eligible again.

The next registration uses the same past deadline, which the scheduler clamps to a 1 ms wait. A persistent failure therefore causes repeated release/write attempts and logging without any new user action or state change.

A deterministic reproduction used the actual policy, an in-memory deadline registration stub, and a consistently rejecting `sleep()` operation. Manually dispatching three callbacks produced:

```json
{"attempts":3,"failures":3,"registrations":4,"nextStillOverdue":true}
```

No real or fake clock advancement, database corruption, or disk fault was used. This proves the policy's requeue behavior, not an end-to-end physical storage fault.

Suggested disposition: report the failure without immediately requeuing the failed item. Decide whether a failure stops automatic rearming until the next external refresh, or only suspends that item while other deadlines continue. The former is simpler but also suspends unrelated future sleep deadlines; the latter needs explicit per-item failure state. Do not introduce a retry/backoff framework. One deterministic failure-path test at the policy boundary is sufficient.

Confidence: High.

### R2 — P3: Application commands receive inconsistent session readiness in Settings

Introduced by: `6bf19bea`.

Locations:

- `src/renderer/app/App.tsx:114–116,347`
- `packages/sdk/src/renderer-commands.ts:7–10`

Opening Settings from a writable session retains the underlying session. `commandSession` becomes null, but `ready` passed to the command palette remains `writable`, which can still be true. Contributions receive `{ session: null, ready: true }`, contrary to the SDK contract that readiness is false outside a session.

Builtin's naming command also checks session presence, so no current builtin execution failure was established. The issue is the host's public context contract, not a reason to add defensive checks to every plugin.

Suggested disposition: derive palette readiness from both current command context and writability, for example `commandSession !== null && writable`. No new state or UI interaction test is needed for this direct assembly correction.

Confidence: High.

### R3 — Cleanup: Remove a duplicated naming eligibility check on the same captured snapshot

Introduced by: `6bf19bea`.

Locations:

- `packages/builtin/src/naming/service.ts:45–46`
- `packages/builtin/src/naming/policy.ts:123–135`
- `packages/builtin/src/naming/runtime.ts:57–60`

The only production caller supplying a non-null automatic trigger obtains it from `automaticNamingTrigger(snapshot, records)`, which already rejects explicit naming on that snapshot. The service immediately checks explicit naming again on the same captured snapshot. It adds no protection against a later change and splits startup eligibility across two layers.

Suggested disposition: remove the service-entry check and keep startup eligibility in the trigger policy. Retain the commit-time check at `service.ts:58–61`: it reads the current path and implements the documented protection for explicit naming and removed trigger material. Do not add tests for the redundant branch or introduce another policy abstraction.

Confidence: High. This is a small maintainability cleanup, not a runtime defect.

### R4 — Documentation: Model discovery still claims it does not probe alternative addresses

Related implementation commit: `68652bb3`.

Locations:

- `docs/development/model-configuration.md:23–29`, especially line 25
- `src/configuration/discovery.ts:15–32`

The engineering document describes a single model-list endpoint and says discovery does not probe alternative addresses. The implementation now races two supported endpoint suffixes under the unchanged configured base path.

Suggested disposition: state that the base path is preserved, supported model-list endpoint candidates are tried, the first fully parsed and paginated catalog wins, and inference configuration is unchanged. Avoid turning the paragraph into an algorithm inventory. No runtime change or test is needed.

Confidence: High.

## Diagnostic tradeoff, not a confirmed defect

`src/configuration/discovery.ts:27–30` deliberately returns the direct candidate's error when both candidates fail. Thus a direct `/models` 404 can hide an authentication error from `/v1/models`, producing less actionable UI feedback.

The behavior is explicit in the implementation, commit rationale, and tests. Preserve it unless the user chooses a different diagnostic policy. If changed, a narrow rule for unsupported versus actionable secondary errors is preferable to a general error-ranking framework.

## Mechanisms and tests worth retaining

- The shared absolute-deadline service has real consumers: automatic session sleep and builtin Timer/Alarm resources. It is not a speculative abstraction. Long-timeout clamping, resume rechecks, cancellation, and callback failure isolation belong to that boundary.
- Startup sleep avoids mounting expired resources. Opening renews attention and protects the watched session before resource restoration. Sleep and archive share teardown without sharing retention semantics.
- Workspace and configuration migrations preserve existing data and establish an inactivity baseline rather than expiring old sessions from their historical creation dates.
- Resource restriction notices and dispatcher enforcement use captured request policy. Creation remains available; restrictions apply to resource tool calls, not resource visibility or authorization in general.
- Discovery candidates own independent pagination state and compete only after a complete valid catalog is available. No additional race controller, version mechanism, or recovery layer was justified.
- The naming commit-time path and explicit-intent checks are business policy, unlike the duplicated check in R3.
- Island close guards, explicit cancellation registration, and plugin-region ownership cleanup serve different lifecycle contracts. The dock/panel extraction has real reuse and does not need reversal.
- No reviewed new test group was established as low-value enough to delete. Naming output acceptance, deadline calculations, migration, retained-reader availability, restriction capture, and pure layout/grouping calculations have independent expected outcomes. Deadline dispatch tests explicitly recheck rather than waiting on real or fake time. Folder palette fixtures do not derive their expected answer from the implementation.

## Validation

| Validation | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; large-chunk warnings remain, without a demonstrated new regression in this range |
| `npm run i18n:check` | Passed: host 951/951 and builtin 832/832 translated messages |
| Runtime review focused tests | 4 files, 48 passed |
| Naming policy/service focused tests | 2 files, 14 passed |
| Pure Island/folder calculation tests | 2 files, 15 passed |
| Discovery/resource restriction focused tests | 2 files, 66 passed |
| SDK runtime/content focused tests | 2 files, 75 passed |
| Sleep failure-policy reproduction | Confirmed repeated overdue registration |

The focused tests total 218 passing cases across 12 files. Expected plugin-failure fixture diagnostics and the existing esbuild/oxc configuration warning appeared in test output. No whole-suite run, GUI launch, installed artifact test, or remote write was performed.

GUI acceptance remains outstanding for actual keyboard focus, inline controls, narrow-window dock behavior, animations, and assistive-technology output. Source inspection and pure-logic tests do not establish those behaviors.

## Commit inventory

Chronological order:

| Commit | Subject |
| --- | --- |
| `2a8d3df7` | fix(ui): remove duplicate restarting status in update popover |
| `fc608cca` | fix(ui): preserve session islands during home transitions |
| `be856c9f` | fix: unify ask user review flow for all question counts |
| `3937cdeb` | style: tighten agent conversation spacing |
| `68652bb3` | fix: discover models through parallel endpoint candidates |
| `71b82060` | fix(ui): keep tool preparation header typography consistent |
| `c0859e25` | fix: surface resource restrictions before creation |
| `967f4eda` | fix(subagents): remove duplicate check body status |
| `eeee2901` | fix(ui): separate island cancellation from closing |
| `812a3a06` | fix: use colon separator in tool call headers for resource name and target |
| `31dbaddb` | fix: align diagnostic request rows and keep costs on one line |
| `357fa378` | fix(ui): dock sidebars outside the island viewport |
| `a646cc00` | feat(sessions): add automatic sleep and configurable recycle-bin retention |
| `77b8590b` | fix(ui): show provider/model identity in agent tooltip |
| `6bf19bea` | feat(commands): add application command palette with session auto-rename |
| `0cf158c9` | feat(sidebar): add folders/recent view switch with persisted state |
| `11ddd961` | fix(folders): mark folder menu selection with a trailing check |

## Proposed implementation scope

Address R1 and R2, remove only the redundant check in R3, and update the paragraph in R4. Choose the R1 failure/rearming policy before changing its external behavior. Keep the existing direct-endpoint diagnostic policy unless separately approved. Add only the deterministic R1 regression test, run the affected focused tests and typechecks, and obtain explicit commit permission after presenting the diff. Archive this record once all findings have a recorded disposition.

## Disposition — 2026-11-06

The user approved R2, R3, and R4 and selected a per-session failure policy for R1. All four findings are addressed in the working tree:

- R1: A failed automatic-sleep attempt is logged and excluded from further automatic attempts in the current process. Other sessions continue scheduling. A successful user open clears that session's failure marker; a fresh process starts without markers. Ordinary replanning and configuration changes do not retry it. The implementation uses one process-local set, without backoff, timed retries, or persistent recovery state. One deterministic policy test checks failure exclusion, continued sibling scheduling, and explicit-open reset.
- R2: Palette readiness now requires both a non-null command session and session writability. No downstream plugin guards or assembly-only tests were added.
- R3: Removed the duplicate captured-snapshot check at service entry. The trigger eligibility check and current-path commit check remain.
- R4: The document now describes discovery of the provider's model-list endpoint through two candidate request addresses, taking one complete catalog rather than merging catalogs. The configured inference address remains unchanged.

The direct-candidate diagnostic preference remains unchanged; its tradeoff is recorded above, not promoted into an additional implementation task.

Follow-up validation: `npm run typecheck` and `npm run build` passed. Five focused test files covering sleep policy, deadline planning/dispatch, storage, naming policy, and naming service passed all 37 cases. The build still reports large chunks, and Vitest still reports the existing esbuild/oxc configuration warning. `git diff --check` passed. No GUI was launched; the original manual-acceptance caveats remain. No commit or remote write was performed.

The user subsequently approved submission and strengthened the existing `AGENTS.md` principle to explicitly allow visible failure and reduced convenience while protecting invariants. Retry and recovery mechanisms require concrete justification rather than an assumption that every operation must succeed.
