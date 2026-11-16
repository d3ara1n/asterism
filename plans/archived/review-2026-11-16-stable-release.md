# Stable-release engineering review — 2026-11-16

## Record, scope, and recommendation

- **Filed:** 2026-11-16; assembly environment observed at 2026-11-16T08:57:56Z (16:57:56 +0800).
- **Repository:** `/Users/chien/Projects/asterism`; branch `main`.
- **Reviewed baseline and assembly HEAD:** `bd207e04f3aa137d33b829fb1b281bfb754d2d55`.
- **Working tree:** clean before delegated review, clean after the reported investigations, and clean immediately before this record was created. Assembly adds only this review record; HEAD remains unchanged.
- **Authority:** root `AGENTS.md` was read. Reviewers reported no nested applicable instructions. This document consolidates completed delegation and coordinator adjudication; assembly is not a new code review.
- **Operations:** no fixes, installs, commits, remote writes, GUI launches, or real-data operations were authorized or performed. Baseline builds regenerated ignored output; investigative probes used isolated temporary data or in-memory fixtures and cleaned up afterward.

**Recommendation: not unconditionally stable-ready.** Resolve or explicitly accept the prioritized defects and the applicable existing product/platform acceptance gates before claiming stable readiness. Passing development checks are evidence, not release approval. Formal stable status does not require version `1.0`.

This record contains **19 consolidated findings: 4 P1 (high), 10 P2 (medium), and 5 P3 (low)**. Priority describes engineering impact, not an automatic release gate. Seven separate nonblocking cleanup opportunities and existing acceptance requirements are not additional defects. The coordinator's narrowed cross-review conclusions supersede stronger initial claims.

No critical remote exploit, irreversible data loss, confirmed finalized-history corruption, or blanket architectural failure was established. The review is bounded, not certification. Nothing here authorizes implementation, changes to public contracts, commit, push, publication, or release. No work has been formally deferred and no task files or plan-status changes accompany this record.

## Design understanding and positive boundaries

The host owns application lifecycle, storage/history envelopes, content authority, generic execution, transport, configuration, plugin loading, and renderer composition. SDK contracts remain paradigm-neutral. Builtin implements Agents and application resources as an ordinary plugin; builtin-api exposes its domain extension contracts without making host business logic depend on builtin implementation.

Authorization is a request/context boundary, not an OS sandbox. Installed plugins, configured services, shells, and local executables are trusted operational inputs. Captured access, configuration, and credentials govern a request and its batch; current reads and processing-order writes remain intentional outside that boundary. Historical identities, provenance, inputs, and completed results are immutable; pending operations fill once. Cancellation scopes own work, while renderer observation is independent of business execution.

The traced paths showed useful boundaries worth preserving:

- No confirmed request-scope resource-access bypass or execution of partially streamed arguments. FileRef addresses and consumption-time resolution are distinct from ContentRef leases and persistent roots.
- Session transactions coherently bind records, cursor/current-data changes, and content roots; fixed pending observations remain separate from shared finalized-body reads. No supported-path premature collection or saved/live-history corruption was established.
- Script outcomes are values, unsuccessful children do not inherently cancel siblings, and script completion cancels and joins outstanding owned calls. Abandoned delegations are finalized as interrupted rather than replayed after restart.
- Receiving subagent pools intentionally own delegated tasks independently; permanent audit retention is deliberate. Those choices are not leaks or missing parent cancellation.
- Shared public-module identity and backend/frontend separation are deliberate. No production host/SDK import of builtin implementation or builtin-api was found in the import review; test helpers are exceptions, not production coupling.
- Delivery has explicit source pinning, semantic-version selection, draft-before-public GitHub publication, and higher-version/channel filtering. These mechanisms do not establish installed acceptance.

The findings support targeted ownership and control-flow corrections, not a blanket rewrite, permission layer, retry framework, revision protocol, or forced shutdown deadline.

## Executable baseline and environment

Sub-1 observed the clean baseline on 2026-11-16, approximately 08:17–08:20 UTC. Commands ran sequentially in this order without retries or automatic fixes; all exited zero.

| Exact command | Elapsed | Result |
| --- | ---: | --- |
| `npm run typecheck` | 4.060 s | `tsc --noEmit` and `tsc -p tsconfig.renderer.json` passed |
| `npm test` | 13.053 s | **247 files, 1,569 tests passed** |
| `npm run test:plugins` | 3.891 s | **4 files, 27 tests passed** |
| `npm run i18n:check` | 8.074 s | Host **982/982**, builtin **959/959** zh-Hans messages translated; SDK author declarations extracted |
| `npm run build` | 1.557 s | Main, preload, and renderer production builds passed |

Installed metadata: macOS 27.2.1 build 26B131, Darwin 27.2.0, arm64; Node 26.13.0; npm 12.2.2; Git 2.54.0 (Apple Git-157); TypeScript 7.0.2; Vitest 5.0.5; electron-vite 6.0.0; Vite 8.3.5; Electron 45.1.0; electron-builder 26.18.0; React 19.3.1; Zod 4.6.7. Electron itself was not launched.

Nonfatal output included the ignored esbuild/OXC setting (C07), AI SDK compatibility/unsupported-parameter warnings, experimental SOCKS5 warnings, and expected negative-path diagnostics. Production output warned about chunks above 500 kB: application approximately 2,373.29 kB and ELK assets approximately 1,463.44/1,462.87 kB. These sizes do **not** prove a measured performance defect or duplicate runtime loading; profiling would precede optimization recommendations.

The baseline worker retained combined output at `/var/folders/jf/ffrxts0n17781sf2bj1k_ffw0000gn/T/asterism-exec-0GLwXv/output.log`. This temporary local path is supporting evidence, not a permanent artifact guarantee. Assembly did not rerun the suites.

Default Vitest uses Node and excludes integration tests (`vitest.config.ts:10–13`); the plugin suite selects process-backed plugin integration (`vitest.plugins.config.ts:6–9`). Neither provides browser/GUI acceptance. Build success does not prove installer completeness, native helper execution, signing, first launch, updates, or migration acceptance. The separate website build was not run.

## Coverage and evidence map

The baseline inventoried **1,567 tracked files**, including tests, assets, documentation, and configuration: host `src/` 525; builtin 554; SDK 140; builtin-api 35; UI 107; scripts 17; workflows 4; docs 45; plans 92; website 24; assets 10; root files 14. All 251 test files are colocated. Inventory is not an every-line audit.

Delegation comprised one baseline worker, seven initial reviewers, three supplemental reviewers, and six cross-reviewers. Task IDs below identify the supplied reports, not persistent repository artifacts. Evidence labels distinguish source tracing (S), isolated/in-memory behavioral probes (P), and subprocess/process-boundary observations (X). No task supplied GUI acceptance.

| Task | Scope and contribution | Evidence |
| --- | --- | --- |
| sub-1 | Environment, five checks, inventory, executable coverage and acceptance-plan map | Commands/configuration inspection |
| sub-2 | Storage preparation/recovery, history, transactions, content roots; R11–R12, C03 | S + temporary-data P |
| sub-3 | Runtime lifetimes, shutdown, shell, renderer disconnect, MCP/process ownership; R01–R02 and watch evidence | S + gated P + process X |
| sub-4 | Dependency direction, public boundaries, lifecycle aggregation and settings layout; C01–C02 | S/import mapping |
| sub-5 | Request access, partial arguments, credentials, model protocols, content and IPC; R09–R10 | S + synthetic P + listener X |
| sub-6 | Plugin discovery/build/load/rendering and 14-resource sampling; R04, C04 | S + temporary-store P |
| sub-7 | Renderer observations/history, dirty navigation, model IDs, disposal warnings, tree retention; R03/R13/R14/R17, C05 | S + tree P |
| sub-8 | Release/version/package/update chain, workflows, native resolution; C06 and acceptance gates | S/configuration/test inspection |
| sub-9 | Cross-review R11–R12 and mutable historical helpers; actual recovery-screen reachability | S + independent temporary-data P |
| sub-10 | Cross-review R01–R02, established/pending watches, C01 | S + independent gated lifecycle/watch P; did not repeat timed shell probe |
| sub-11 | Cross-review R09–R10, trusted-environment framing and runtime-versus-main consequence | S + synthetic P + terminating subprocess X |
| sub-12 | Cross-review R03/R04/R13/R14/R17, native semantics versus GUI evidence | S + independent plugin/tree P |
| sub-13 | Supplement: QuickJS, Agent admission/compaction, subagent execution/audits; R19 and scheduling decision | S + gated audit P |
| sub-14 | Supplement: messaging/web/usage adapters, configuration, schedules/DST, shared Todo; R08/R15/R16, Sentry absence | S + synthetic/in-memory P |
| sub-15 | Supplement: composer/files, directory editor, Agent/role/MCP fields and other resource UI; R05–R07/R18 | S + in-memory P |
| sub-16 | Cross-review R08/R15/R16/R19, installed QQ SDK contract and SDK decision boundary | S + independent synthetic/P + temporary audit P |
| sub-17 | Cross-review R05–R07/R18, same-document form association and UI field ownership | S/native-browser contract analysis |

The initial resource inventory covered Agent, Directory, Note, Manual, Web, MCP Host, Terminal, Timer, Alarm, Todo List, Subagent Pool, Mesh, Conversations, and Chat. Sampling breadth does not mean every tool, adapter, UI, or lifecycle permutation was verified.

## Prioritized findings

### R01 — P1: archive/quit ordering can skip shared cleanup and mask failure

- **Locations:** `src/runtime/sessions.ts:714–735`; `src/plugins/loader.ts:415–418,485–503`; `src/runtime/index.ts:61–67`; `src/main/runtime-host.ts:108–118`.
- **Trigger → impact:** archive is awaiting owned-task cancellation when application quit begins. Global plugin closure closes the event bus before archive release resumes its presence publication; both operations reject with `Event contract asterism/resource-presence is unavailable.` The rejection precedes `shared.close()` and archive persistence.
  Runtime's unconditional exit-zero finalizer and parent exit handling can make failed cleanup look successful.
- **Evidence/confidence:** high; sub-3 and independent sub-10 real-service, temporary-data, promise-gated probes.
  Cross-review observed zero `shared.close` calls and session lifecycle still running. Supported quit entry points can overlap an existing archive; this is not a hypothetical write race. Surviving orphan processes were **not** demonstrated.
- **Minimal fix/tradeoff:** drain existing deactivations before disposing facilities they consume; if cancellation starts globally, separate it from final bus disposal.
  Preserve independent cleanup reachability and expose shutdown failure. Do not suppress the publication error or merely substitute `allSettled` for incomplete archival.
- **Validation needed:** deterministic owned-lifecycle gates around archive cancellation, close, and shared cleanup; injected close rejection must remain visible at parent handoff.
  Native quit/update interaction still needs manual acceptance; no forced deadline or retry is proposed.

**Related lifecycle ownership evidence for the same fix batch:** sub-3/sub-10 also confirmed ownerless renderer watches at `src/runtime/connection.ts:78–94` and `src/runtime/sessions.ts:173–178,523–542`. Established watches and watch admission completing after disconnect retain `watching`, cache, and suppress sleep within the running runtime. Bind established and pending admission to connection lifetime, without removing a replacement connection's watch or cancelling business work. Validate disconnect before/after admission and replacement ownership deterministically. This supporting lifecycle item is retained here, not assigned an additional finding ID or included in the 19-finding count.

### R02 — P1: foreground shell exit prematurely removes cancellation/timeout control

- **Locations:** `src/shell/execution.ts:54–59,77–83`; `src/shell/process.ts:45–65,83–87`; total-limit/process-group contract at `packages/builtin/src/filesystem/exec-contract.ts:14,19`.
- **Trigger → impact:** foreground exits while a background descendant retains inherited output. Executor removes abort/timeout ownership before output settlement; process `stop()` is a no-op after exit.
  Continued output rearms idle completion, so a pending invocation can ignore cancellation and remain pending indefinitely, delaying archive/shutdown draining.
- **Evidence/confidence:** high; sub-3 process/executor probe and sub-10 independent source/contract review.
  Original macOS probe: foreground exit about 4 ms; a 0.2-second timeout plus abort at 194 ms still returned about 1,098 ms as successful/exited while the self-terminating descendant wrote output. Cross-review did not repeat timing measurements.
- **Minimal fix/tradeoff:** retain cancellation through complete output settlement; explicit stop must address the remaining owned POSIX process group and finalize collection while retaining accepted output.
  Ordinary successful foreground exit must not itself kill background jobs. Moving listener cleanup alone does not fix post-exit `stop()`.
- **Validation needed:** controlled foreground-exit/output gates for post-exit abort and timeout decision logic, correct non-success/unknown-effects reporting, and unchanged ordinary background semantics.
  No new real/fake timing tests. Windows parent-based termination after parent disappearance needs separate design/acceptance; POSIX correction is not a verified Windows remedy.

### R03 — P1: Settings Back bypasses dirty-editor guards

- **Locations:** `src/renderer/app/App.tsx:124–137,222`; `src/renderer/features/settings/SettingsPage.tsx:169–181`; guard registration at `src/renderer/shared/weave/IslandPanel.tsx:23–25`.
- **Trigger → impact:** edit provider/model settings, then use titlebar Back. Page switching bypasses Screen closure guards; the delayed generation/key reset remounts Settings and destroys unsaved drafts.
  Native unsaved tracking does not intercept React navigation. Persisted settings are not erased.
- **Evidence/confidence:** high; independent sub-7/sub-12 source traces through guards, navigation, native-unsaved handling and keyed remount.
  Normal island closure and All Settings are guarded; this is a page-departure bypass. No GUI reproduction was performed.
- **Minimal fix/tradeoff:** expose Settings' existing guarded `closeAll()` boundary to page navigation and await acceptance before leaving; refusal retains page and values.
  Reuse guards rather than adding draft persistence or unrelated navigation machinery.
- **Validation needed:** manual dirty provider/model departure, cancel/confirm, multiple islands and clean departure; typecheck/build as appropriate. No UI interaction tests.

### R04 — P1: replacement renderer uses pending plugin configuration instead of captured composition

- **Locations:** `src/runtime/service.ts:106–129`; `src/renderer/application.tsx:84–102`; macOS lifecycle at `src/main/index.ts:158–163,338–350,434–445`.
- **Trigger → impact:** disable/remove a loaded plugin, then close/reopen the macOS window without quitting.
  Backend retains captured loaded packages, while management projection marks disabled entries pending with null renderer or omits removed entries. Fresh renderer filters that projection, losing still-active plugin views/settings/commands and contradicting restart-required semantics.
- **Evidence/confidence:** high; independent sub-6/sub-12 actual-service temporary-store probes confirmed loaded backend versus pending/absent management selection; renderer/bootstrap and window path were source-traced, not Electron-tested.
  Destroyed renderers cannot recover omitted contributions from their old module cache.
- **Minimal fix/tradeoff:** project captured runtime renderer composition separately from editable next-startup management state.
  Initialize replacement renderers from the former; retain pending settings in the latter. This is a projection boundary, not hot unloading or revision coordination.
- **Validation needed:** focused behavioral projection test for disable/remove and a new application honoring changed configuration; opt-in integration when plugin composition/build boundaries change; manual macOS close/reopen acceptance.

### R05 — P2: Agent/role Save can target another mounted editor

- **Locations:** `packages/builtin/src/configuration/AgentsSettings.tsx:217–227`; `packages/builtin/src/configuration/RolesSettings.tsx:132–143`; external submit association at `packages/ui/src/configuration-forms.tsx:121–127`; retained islands at `src/renderer/shared/weave/Screen.tsx:346–368`.
- **Trigger → impact:** open two same-kind editors. Fixed `agent-form`/`role-form` IDs make the later titlebar Save associate with the first matching form.
  That form's own validation/submit handler runs, potentially persisting its unrelated draft; the later editor remains unsaved. B's field values are not mixed into A's record.
- **Evidence/confidence:** high source/native-contract evidence from sub-15/sub-17: distinct island keys coexist in one document; Button preserves native `form` attributes. Browser interaction is manually untested.
- **Minimal fix/tradeoff:** one instance-local `useId()` value for each editor's external button and form; no persistence or island coordination changes.
- **Validation needed:** typecheck/build and manual simultaneous Agent/role editors, including invalid first form; each Save must affect only its own draft. No declaration-only or DOM tests.

### R06 — P2: successful Role save overwrites typing admitted while pending

- **Locations:** `packages/builtin/src/configuration/RolesSettings.tsx:136–148`; `packages/ui/src/configuration-forms.tsx:21–28,121–127`; Agent precedent at `AgentsSettings.tsx:227` in the same configuration directory.
- **Trigger → impact:** save a role and keep typing before success. Inputs stay enabled, but success unconditionally resets slug/description to the earlier submitted receipt, losing newer unsaved text.
  Failures were not shown to reset the draft; the window depends on interaction during the pending interval.
- **Evidence/confidence:** high; sub-15/sub-17 traced closure values, input handlers, action-only disabling and success resets. No GUI latency measurement is claimed.
- **Minimal fix/tradeoff:** local `<fieldset disabled={busy}>`, matching Agent editing. Briefly prohibit edits rather than introducing response merging, revisions, or generations.
- **Validation needed:** manual pending-save field disabling and failed-save draft retention; normal typecheck/build. No timing or UI test additions.

### R07 — P2: MCP detail draft resubmits stale hidden enabled state

- **Locations:** `src/renderer/features/mcp/Settings.tsx:128–129,175–199,231–260`; `src/renderer/features/mcp/form.ts:43–45,69–71`; replacement at `src/mcp/application.ts:43–57`.
- **Trigger → impact:** open an enabled server editor, complete a disabling row toggle, then save unrelated detail changes.
  Opening-time `enabled: true` survives in the hidden full draft and re-enables the server; inverse behavior can disable it. Backend correctly applies the later complete write; UI field ownership is defective.
- **Evidence/confidence:** high; sub-15 actual draft/validation probe yielded latest false/submitted true; sub-17 independently traced retained draft, subscription and full-entry replacement. No service connection was made.
- **Minimal fix/tradeoff:** details do not own `enabled`; compose an existing server's outgoing full configuration with current subscribed `saved.enabled` at submission.
  Preserve creation defaults. No public-call patch semantics, backend ignoring fields, or conflict protocol is required.
- **Validation needed:** manual sequential toggle-then-detail-save in both directions and new-server creation; focused pure draft-ownership logic only if extracted meaningfully.
  Public `SaveMcpServer` semantics must remain unchanged absent a separate decision.

### R08 — P2: Directory exec reads shell configuration after the request boundary

- **Locations:** `packages/builtin/src/filesystem/runtime.ts:83–85`; `src/shell/execution.ts:18–20`; `src/shell/host.ts:15–17,25`; capture at `src/execution/capabilities.ts:26–30`; SDK surface at `packages/sdk/src/runtime-shell.ts:7–10`.
- **Trigger → impact:** request starts under shell configuration A, configuration B is saved while generation continues, then Directory exec uses B's executable/arguments/environment.
  No contribution capture hook or intermediate snapshot exists; sequential calls in one batch can change environments.
- **Evidence/confidence:** high; sub-14/sub-16 actual contribution/executor probes and full forwarding trace.
  Independent probe showed no settings reads at preparation, then one read and output B at execution. This is request-environment inconsistency, not a processing-order write conflict or sandbox issue.
- **Minimal fix/tradeoff:** explicitly bind a captured shell executor/settings handle through the tool capture boundary; retain handling-time reads for standalone operation-scoped consumers.
  The cohesive SDK surface change is a **public contract decision requiring user approval**, not routine implementation authorization.
- **Validation needed:** approved API choice first; deterministic capture-A/change-B/execute-A test at the owning boundary, cancellation ownership preserved, typechecks and affected public examples.
  Avoid ambient request context, global freezing, revisions or locks.

### R09 — P2: usage queries bypass the existing API-key transport rule

- **Locations:** `src/configuration/usage.ts:53–63`; `packages/builtin/src/providers/usage-http.ts:17–23`; existing rule at `src/model/provider.ts:8–18`; automatic read at `src/renderer/features/configuration/ProviderUsageButton.tsx:26–40`.
- **Trigger → impact:** an enabled custom API-key connection with remote HTTP and a query usage provider mounts in settings.
  Usage resolves the key and sends Authorization over plaintext even though execution/probes/discovery reject that connection under the existing HTTPS/loopback rule.
- **Evidence/confidence:** high; sub-5/sub-11 synthetic transport probes using actual service/schema/provider observed `http://provider.example.invalid/user/balance` and a synthetic Bearer key.
  No real credential or request. Presets use HTTPS; redirects already use `error`. No redirect leak, critical remote exploit, or compromise was established.
- **Minimal fix/tradeoff:** reuse the existing validator in the active configured query branch before credential retrieval/provider invocation; leave header-only providers unchanged.
  This restores an existing safeguard in a trusted configured environment, not a general plugin networking restriction.
- **Validation needed:** owning-boundary behavioral test rejecting remote HTTP before credential/provider access, with HTTPS/loopback controls; define short configuration-error feedback.
  No allowlist, retries, or duplicate transport policy.

### R10 — P2: malformed OAuth callback target escapes into runtime-process failure

- **Locations:** `src/mcp/auth.ts:112–132`, especially URL construction at `:115`; listener admission at `src/mcp/session.ts:181–187`; supervision at `src/main/runtime-host.ts:28–30,76–94`.
- **Trigger → impact:** during an active temporary loopback OAuth listener, a local raw client sends request target `http://[`.
  Node invokes the callback; `new URL` throws before path/state validation. The startup catch does not cover later request events; shared task runtime can exit and interrupt unrelated work.
- **Evidence/confidence:** high; sub-11 actual implementation subprocess with observational uncaught-exception monitor exited 1 with `ERR_INVALID_URL`; sub-5 independently observed the exception.
  Binding is `127.0.0.1`, normally up to five minutes. This is not a proven remote exploit, browser delivery chain, OAuth bypass, or Electron-main crash.
- **Minimal fix/tradeoff:** contain URL parsing inside the callback and return existing invalid-callback 400 while leaving authorization pending. No global exception handler, listener retry or recovery framework.
- **Validation needed:** isolated listener malformed-target response without process failure, then a valid state-bearing callback completing the same attempt. Exact packaged GUI failure presentation remains unaccepted.

### R11 — P2: restored plugin data bypasses the migration pause

- **Locations:** `src/storage/preparation.ts:173–175,202,206–212`; restore promise at `src/shared/error-display.ts:38–39`; confirmed recovery action/main path at `src/main/index.ts:216–234` and `src/runtime/prepare-data.ts:21–25`.
- **Trigger → impact:** restore a point with current host formats and older plugin data. The pause checks host migrations only and is cleared before plugin inspection, so normal startup migrates the plugin without explicit retry, contradicting the restoration confirmation.
- **Evidence/confidence:** high; sub-2/sub-9 independent temporary JSON-store reproductions. Cross-review established actual recovery UI reachability through a **later qualifying host-data preparation failure**; plugin-local failure alone returns `ok:true` and does not expose that screen.
  Displaced/target recovery points remain; irreversible loss was not shown.
- **Minimal fix/tradeoff:** preserve the marker through host and plugin plan inspection; gate before recording/applying any required migration.
  Plugin pause must surface top-level paused failure, not be swallowed as disable-plugin-and-continue. Preserve successful startup where no migration is needed.
- **Validation needed:** current-host/old-plugin restore remains unchanged and paused until explicit retry; retain outdated-host pause/retry controls. No new recovery state machine or blanket plugin disabling.

### R12 — P2: recovery reuse crosses a writable-startup boundary

- **Locations:** `src/storage/preparation.ts:178–190,213–221`; displaced-data preservation at `:119–129`; blocked-host retry control at `src/storage/preparation.test.ts:58–69`.
- **Trigger → impact:** plugin migration fails but permits startup; unrelated user work changes covered data; later retry of the same transition succeeds but reuses the old full-dataset point.
  No point represents the complete dataset immediately before that retry; rollback activates an older dataset and requires separate reconciliation of intervening work.
- **Evidence/confidence:** high; sub-2/sub-9 independent temporary-store probes observed one old point while live host data retained subsequent writes.
  Restore preserves current data in a `before-restore` point; this is confirmed recovery-fidelity loss, **not** demonstrated permanent loss. The old point remains accurately dated and valid as an older snapshot.
- **Minimal fix/tradeoff:** retain cross-invocation reuse for blocked host retries; take a fresh point when an invocation's first recorded migration is plugin-owned, then share within that invocation.
  Repeated usable startups can consume retention slots. Fix is recommended, or **explicitly accept** stale-baseline versus retention semantics; neither policy is equivalent freshness.
- **Validation needed:** failed plugin → unrelated covered write → successful retry snapshots that write; preserve blocked-host reuse and displaced-data recovery. No hashing, revision tracking or automatic reconciliation.

### R13 — P2: model control IDs collide across retained editors

- **Locations:** `src/renderer/features/configuration/ModelProvidersSettings.tsx:242–244,315,360–384`; retained DOM at `src/renderer/shared/weave/Screen.tsx:346–369,421–429`.
- **Trigger → impact:** multiple model islands emit fixed capability, thinking-level and description IDs in one document.
  Later labels/descriptions resolve to the first matching target rather than their own controls; an earlier inert island may make activation appear ineffective instead of changing the intended draft.
- **Evidence/confidence:** high for source/native association from sub-7/sub-12; no separate documents/shadow roots or unmounting provide isolation. Exact pointer behavior was not manually exercised.
- **Minimal fix/tradeoff:** prefix all affected IDs and `htmlFor`/`aria-describedby` values with the editor's existing `useId()` form value. Local identity correction only.
- **Validation needed:** typecheck/build and manual simultaneous/offscreen editors, capability/thinking labels and accessible description associations; no DOM/declaration tests.

### R14 — P3: disposal warnings conflate pending/error with successful empty

- **Locations:** `src/renderer/features/session/disposal.ts:8–23`; `src/renderer/features/workbench/ObjectActions.tsx:70–78`; `src/renderer/app/SessionActions.tsx:55,116–123`; `src/renderer/features/session/History.tsx:282–296`.
- **Trigger → impact:** destructive confirmation opens while warnings load or fail; the hook returns `[]` in both cases and permits confirmation.
  Existing terminal warnings about shell/child termination may never be shown. Rewind's separate leaving-object read does not establish warning-read completion.
- **Evidence/confidence:** high source evidence, independently sub-7/sub-12; terminal warning at `packages/builtin/src/terminal/runtime.ts:109–113`.
  No GUI latency measurements. This establishes a presentation gap, not mandatory fail-closed semantics.
- **Minimal fix/tradeoff:** expose pending/ready/error state at the shared hook and show short unavailable/loading state.
  **User decision:** whether confirmation waits while loading and whether failure blocks or permits proceeding. Do not silently equate failure with no warnings, impose retries, or add atomic rechecks.
- **Validation needed:** manual removal/archive/rewind with pending, failed, empty and nonempty reads under the chosen policy; focused pure state logic only if meaningful, no UI/timing tests.

### R15 — P2: QQ token host differs from the installed official SDK contract

- **Locations:** `packages/builtin/src/messaging/qq-api.ts:5,44–60`; initial lookup at `packages/builtin/src/messaging/qq.ts:53–56,68`; installed `node_modules/@tencent-connect/qqbot-nodejs/src/protocol/api/token.ts:11–12,194–209` and `USAGE.md:72–73` (version 1.0.5).
- **Trigger → impact:** uncached QQ connection requests a token before identity lookup/gateway use. Custom API builds `https://api.bot.qq.com/app/getAppAccessToken`, while SDK token contract uses `https://bots.qq.com/app/getAppAccessToken`.
  If the alternate host fails, initial connection/refresh cannot proceed.
- **Evidence/confidence:** high for mismatch and initialization dependency; sub-14/sub-16 synthetic fetch probes independently observed token then resource API requests.
  No live rejection or absence of redirects was demonstrated; not an unconditional app-wide outage.
- **Minimal fix/tradeoff:** separate fixed token endpoint matching the SDK contract, retaining `api.bot.qq.com` for resource requests. No refresh/retry abstraction is implied. Resolve before accepting QQ support.
- **Validation needed:** meaningful adapter-boundary fixture distinguishing authentication and resource requests, plus human/live QQ acceptance with authorized credentials; do not test a URL constant alone.

### R16 — P3: Exa/Parallel shape failures use the wrong error classification

- **Locations:** `packages/builtin/src/web/exa.ts:99–100`; `packages/builtin/src/web/parallel.ts:36–37`; helper at `packages/builtin/src/web/response.ts:5–10`; wrapping at `packages/builtin/src/web/runtime.ts:13–17` and `src/configuration/web-providers.ts:130–136,163–165`.
- **Trigger → impact:** malformed successful provider response throws raw `ZodError`, becoming `request_failed` instead of `WebError` code `protocol`.
  Failure stays visible; no successful-result corruption or masked success was shown.
- **Evidence/confidence:** high; sub-14/sub-16 actual malformed-response probes contrasted both adapters with shared-helper behavior. No live provider traffic.
- **Minimal fix/tradeoff:** use existing `parseWebResponse()` at both sites; preserve cause/provider context. No additional validation layer or fallback.
- **Validation needed:** malformed response classification once at owning adapter boundary; preserve useful cause. Avoid forwarding-only or declaration assertions.

### R17 — P3: directory pause/reopen prunes nested expansion too early

- **Locations:** `packages/builtin/src/filesystem/tree-store.ts:133–155,235–246,265–288`; `packages/builtin/src/filesystem/tree-model.ts:19–34`.
- **Trigger → impact:** expand `a/` and `a/b/`, release the last tree consumer, then reopen. Pause drops bodies but retains intent; root-only refresh treats unloaded descendants as missing and deletes `a/b/` expansion before its parent loads.
  Nested expansion is lost, not file data.
- **Evidence/confidence:** high; independent sub-7/sub-12 actual TreeStore/FileTree probes showed both expanded before pause, only `a/` expanded afterward. No filesystem watcher or GUI test.
- **Minimal fix/tradeoff:** prune only where an authoritative loaded ancestor listing proves disappearance; distinguish unknown from absent. Do not retain reconstructible bodies or add timers/extra reads merely to preserve intent.
- **Validation needed:** deterministic reconciliation for nested reload retention and genuine parent-list deletion; normal UI typecheck/build, manual navigation acceptance.

### R18 — P3: composer advertises attachment admission while uploading

- **Locations:** `packages/builtin/src/agent/conversation/Composer.tsx:30–31`; `packages/builtin/src/agent/conversation/Files.tsx:128–150`; `packages/builtin/src/agent/conversation/draft.ts:70–76`.
- **Trigger → impact:** drop/paste a second batch while staging one. File handlers omit uploading from disabled state, advertise copy/consume input and invoke `add`, which silently returns during uploading with no error.
  Original files survive; the new attachment is absent.
- **Evidence/confidence:** high; sub-15 controlled-promise actual draft probe and sub-17 independent event/admission trace. Native drag/paste interaction untested.
- **Minimal fix/tradeoff:** include uploading in disabled feedback/admission, matching the picker and one-batch policy; no queue.
  **Keep `preventDefault`/`stopPropagation`** so rejected conversation files do not fall through into workbench creation. This is no addition attempt/none feedback, not no event consumption.
- **Validation needed:** manual upload-overlap drop/paste feedback and no workbench fallthrough; no timing/UI tests or new queue semantics.

### R19 — P3: audit text overstates abrupt-interruption durability

- **Locations:** `packages/builtin/src/subagents/audit.ts:33–34,49–51,62–77`; `docs/development/subagent-pool.md:47`; orderly drain at `packages/builtin/src/subagents/execution.ts:212–214`.
- **Trigger → impact:** attachment copying blocks a queued audit unit while later appends enqueue. Crash can omit multiple queued entries/attachments, contrary to “at most final line” claims; investigators could infer activity never occurred from absent entries.
- **Evidence/confidence:** high; sub-13/sub-16 independent gated attachment probes: nine appended entries, one readable line while blocked, nine after orderly close.
  Normal finalization drains; no finalized Delegation loss/replay was established.
- **Minimal fix/tradeoff:** correct comment and engineering prose: ordered queued writes, line before attachment copy, orderly close awaits queue; interruption can leave incomplete last line and omit queued entries/copies.
  **Documentation correction only**, not stronger crash durability, fsync, synchronous writes or recovery machinery.
- **Validation needed:** semantic/terminology/standalone-readability check against actual queue behavior. No copy-only tests or implementation change implied.

## Separate nonblocking cleanup opportunities

These seven ownership/maintenance opportunities are not counted as additional defects or accepted deferrals. None justifies a broad refactor or a release gate by itself.

- **C01 — redundant controller lifecycle projection.** `src/plugins/sdk-adapters.ts:161–164`, `src/plugins/loader.ts:226,403–407`, `src/plugins/lifecycle.ts:40–46`, and `src/runtime/sessions.ts:125–129,263–269,300–309,413–419`. High-confidence source/cross-review (sub-4/sub-10): controller activity duplicates owning lifecycle aggregation; controller live output is empty and close lacks a production caller. Remove alternate hooks/consumers if confirmed complete, but preserve queued/executing `runs.start()` at `sdk-adapters.ts:131–144`, lifecycle cancellation and `pendingActions` preparation/finalization coverage. Validate existing action/removal/rewind/cleanup tests and typecheck; no forwarding tests.
- **C02 — duplicate settings layout.** `src/renderer/features/settings/layout.tsx:1–21` duplicates `packages/ui/src/settings-layout.tsx:1–21` in active consumers. High-confidence source comparison (sub-4). Import shared owner or temporarily re-export, avoiding host/plugin divergence with no new API/dependency. Typecheck/build; manual visual acceptance if changed, not rendering tests.
- **C03 — multiple atomic JSON replacement owners.** `src/storage/files.ts:12–19`, `src/plugins/storage.ts:19–23`, `src/plugins/packages.ts:159–163`, `src/configuration/store.ts:196–213`. High-confidence source evidence (sub-2); no accepted-write corruption demonstrated. Share only replacement mechanics while preserving permissions, validation, error translation, failure cleanup and publish-after-save semantics. Test meaningful original-preservation/publication failures, not serialization constants; deterministic temporary names are not themselves a concurrency defect.
- **C04 — unused preloaded public-provider branch.** `src/shared/public-modules.ts:14–41`, `src/plugins/package-modules.ts:80–87,141–156`, `src/plugins/packages.ts:277–278,362–377`, `src/storage/application.ts:74–75`. High confidence unused in production, medium removal preference (sub-6). Verify no concrete unrecorded consumer before removing global bridge/alternate ownership branch; retain real shared SDK/UI and package-backed public APIs plus needed types. Run focused opt-in public identity/dependency/build integration; remove tests solely for deleted unused machinery.
- **C05 — redundant nested catalog observations.** Root `src/renderer/app/App.tsx:320`; repeats at `src/renderer/features/workbench/Workbench.tsx:85`, `ObjectIsland.tsx:48`, and `src/renderer/features/creation/coordinator.tsx:182`; provider/read ownership at `src/renderer/modules/object-context.ts:14–24`, `features/configuration/state.ts:25–29`. High-confidence source evidence (sub-7), no measured performance impact. Prefer one application observation while preserving genuine availability distinctions; typecheck/build and manual contextual availability acceptance, not subscription-count tests.
- **C06 — dead builtinMetadata assembly.** `packages/builtin/src/metadata.ts:1–9`; real manifest owner at `packages/builtin/package.json:69–81`/`src/plugins/packages.ts:50–65`; extraction at `scripts/i18n.ts:108–128`. High-confidence reference/source evidence (sub-8). Remove unused object/import assembly, **retain declarations required for extraction** or deliberately improve generic extraction. Typecheck and i18n check; no constant/copy tests.
- **C07 — obsolete Vitest transformer option.** `vitest.config.ts:8–9` configures/comments esbuild JSX while runner says OXC is used and esbuild ignored. High-confidence baseline warning (sub-1), not an established behavior failure. Remove obsolete setting or express intended JSX via active transformer; validate relevant TSX tests and typecheck. Do not change transformer/dependency policy speculatively.

## Decisions and acceptance gates — not additional defects

The following separates observed source mechanisms, unresolved user choices, and existing plan records. An unchecked historical plan item is an acceptance lead, not proof of today's distribution history or an independently reproduced bug. No status is changed by this review.

| Area | Evidence and required decision/acceptance |
| --- | --- |
| Actual first user distribution | Establish whether any user-facing distribution, including friend-facing prereleases, occurred. Internal test releases do not establish compatibility. Record the first applicable persistent-format baseline, then preserve continuous n-to-n+1 migrations and meaningful old-format fixtures. Lead: `plans/todo-2026-10-26-release-readiness.md:19–20`. |
| Historical migration semantics | Current older transforms use mutable helpers/defaults: `src/configuration/store.ts:74`, `src/runtime/storage.ts:85–98`, `packages/builtin/src/storage.ts:33`. No current supported-format failure was demonstrated. Freeze/version required published semantics when establishing the baseline; do not invent obsolete-format support solely because helpers are shared. Existing principle: `src/storage/README.md:32`. |
| Advertised platform set | Workflows target macOS arm64, Windows x64 and Linux x64; that is not installed acceptance. Decide advertised support and verify corresponding native helpers, installation and updates. Open lead: `plans/todo-2026-09-17-release-ci.md:32–39`. |
| Ordinary-user installed behavior | First launch/Gatekeeper/signing identity, installation replacement, update continuity, migrations and recovery need installed acceptance. Fixed self-signed/non-notarized macOS and unsigned Windows updater settings are explicit current choices, not new defects; audience suitability remains a decision. Preserve prior acceptance caveats rather than generalizing one macOS result to every platform. |
| Exact candidate evidence | Tie typechecks/tests/catalog/build and relevant opt-in plugin integration to the exact candidate SHA. Release preparation checks main during promotion, while build/publication use selected older candidate SHA (`.github/workflows/release.yml:37–63,90–92,167–169`). Record that candidate's original checks; do not describe promotion-main checks as fresh tests of the older SHA. |
| Promotion and npm coordination | First automated stable promotion, cumulative stable notes/assets, npm `latest` movement and installed update continuation remain acceptance leads: `plans/todo-2026-09-17-release-ci.md:31–37`, `plans/todo-2026-10-27-public-api-stability.md:37–38`. No live GitHub/npm state was queried. Stable need not be 1.0. |
| External plugin/public package claims | Complete packed exports/dependency/example/asset closure and unchanged external-plugin compatibility; source exports/build identity alone are insufficient. Leads: `plans/todo-2026-10-27-public-api-stability.md:32–33,46–50`; release readiness `:24–27`. Application-side acquisition/lifecycle is separate from SDK publication. |
| Sentry before stable | Prior user-confirmed requirement at `plans/todo-2026-11-11-sentry-error-collection.md:7,11–19`, repeated at release-readiness `:55`. Sub-14 independently found no SDK initialization/capture integration; current reports are local (`src/main/logging.ts:94–121`). Privacy, dependencies, consent/payload, attribution, private source maps and packaged acceptance remain decisions. An MCP server named Sentry is not application reporting; do not silently upload local logs/reports. This names stable promotion, not every prerelease. |
| Explicit finding choices | R08 needs approval of the public captured-shell SDK contract; R12 needs fresh-snapshot versus retention acceptance if not fixed; R14 needs loading/proceed and failure/block policy. Recommendations are not approval of new semantics. |
| Manual compaction scheduling | Inputs accepted during standalone compaction remain drafts (`packages/builtin/src/agent/admission.ts:45–59`, `controller.ts:140–152,169–174`). Existing tests intentionally retain drafts and distinguish acceptance from processing; this is **not** a confirmed dropped-work bug. Decide scheduling only if automatic processing of newly arriving submissions is desired. |
| Other product/interaction acceptance | Resource/access flows, empty-install first task, plugin/skills settings and post-compaction continuation remain plan leads at release-readiness `:42–51`; Chinese IME at `plans/todo-2026-11-05-composer-reference-chips.md:69–75`; branding/reporting information at release-readiness `:63–66`. These were not newly accepted or automatically elevated to gates by assembly. |

Release mechanics inspected positively include all-platform build dependency before publication, npm before GitHub publication, draft upload before public release, preservation of an already-public release, and skipping already-published npm versions on publication-job rerun. GitHub/npm are intentionally nontransactional: partial publication/dist-tag movement or a stranded draft can occur. Rerunning the failed job with its captured plan differs from a new workflow recomputing remote state. No rollback/retry machinery is proposed without a stronger contract.

## Remaining leads and verification limits

Unconfirmed leads are **not promoted to defects**: startup login-shell discovery may outlive cancellation of its wait (`src/main/startup-coordinator.ts:52–69`, `src/main/shell-environment.ts:7–11`); Mesh indirect captured descriptions may become unavailable after another resource is removed; creation batches may consult mutable navigation ownership across awaits (`src/renderer/features/creation/coordinator.tsx:142–155`). Their promised behavior and complete reachability need focused investigation before classification.

The scheduling/DST and shared Todo supplement found no additional actionable defect in sampled occurrence calculation, skipped-hour normalization, retention, transfer, ownership or post-commit notification paths. Repeated-hour semantics were not expanded into new requirements. Directory saves retain newer typing correctly; question enlargement shares retained answers; composer submit admission checks uploading. These non-findings are limited to traced paths.

Explicit limits across the review:

- No actual Electron/native GUI, screenshots, keyboard/focus/screen-reader, IME, native drag/drop, or visual acceptance; DOM association conclusions use standard browser semantics and source, not measured pointer interaction.
- No live provider credentials/network, QQ gateway, messaging delivery/reconnect/rate-limit acceptance, MCP OAuth provider/token lifecycle, or remote usage/provider compatibility acceptance. Synthetic endpoint construction is not live outage proof.
- No packaged artifact generated/inspected by these reviewers, installed esbuild/ripgrep/watcher/PTY execution, full public tarball closure, signing-state query, first launch, real migration/update/recovery, or Windows/Linux execution.
- No GitHub/npm run history, secrets/trusted publishers/protection or signing configuration state queried. CI source review cannot certify operational configuration or first stable promotion.
- No heap/performance profiling; chunk warnings, redundant reads and retained caches have bounded evidence, not measured global latency/memory claims. No separate website build/accessibility acceptance.
- Storage/content/private databases and transfer consumers were sampled, not exhaustively fault-injected; no complete distributed-format fixture history, power-loss durability proof, or systematic crash/storage-failure pending-record review.
- Model protocol conversion, QuickJS, Agent/subagent execution and resources received mechanism review, not every-line verification or all interleavings. External plugin ergonomics and complete API stability were not certified.

## Assembly validation

- Checked English language, terminology, standalone context, and separation of findings, cleanup, decisions and acceptance leads against the supplied adjudication.
- Reconciled all R01–R19 IDs and priorities, C01–C07, task provenance, baseline command results, and narrowed evidence/impact qualifications; no initial stronger claim is adopted as an adjudicated conclusion.
- Each numbered finding identifies source locations, trigger/impact, evidence/confidence, a bounded fix/tradeoff and required validation. Related watch evidence is explicitly retained within the lifecycle discussion rather than given a twentieth finding ID.
- Checked document whitespace and repository status; only this new review record is added, with no tracked modifications or HEAD change. No implementation suites were rerun for document assembly.
- This is an evidence record, not acceptance sign-off or an implementation backlog. Existing plan statuses remain untouched; an independent documentation audit can review this deliverable separately.

## Proposed fix batches and validation sequence

These are proposed implementation groupings, **not authorization or formal deferral**. Keep each change scoped to its owner and obtain decisions at public protocol, product, dependency, storage or external-behavior boundaries.

1. **Lifecycle ordering, cancellation and watch ownership:** R01–R02 plus the confirmed related connection-watch evidence. Drain before disposing shared infrastructure, keep shutdown failures visible, retain shell cancellation through settlement, and bind watch admission/release to its connection without stopping business work. C01 can remain separate; preserve action tracking if removed.
2. **UI draft and identity ownership:** R03–R07 and R13. Reuse dirty guards, captured plugin composition, per-instance IDs, local pending fieldsets and current enabled-field ownership. Do not change backend last-write-wins or public MCP replacement semantics.
3. **Credential/OAuth/request capture:** R09–R10 and R08 after SDK approval. Reuse existing transport policy, contain malformed callback parsing and explicitly capture shell settings. No new permission model, global exception recovery or ambient context.
4. **Recovery semantics:** R11–R12 after freshness/retention disposition. Gate all required migrations while paused, preserve blocked-host retry behavior, and retain displaced data. Confirm actual distribution baseline before unrelated migration compatibility work.
5. **Small adapters, retained state and documentation:** R15–R19, with R14 presentation/policy resolved separately. Correct QQ endpoint ownership and web classification, distinguish loaded absence from unknown tree state, align attachment feedback, and correct audit claims without stronger durability requirements. Cleanup C02–C07 is optional scope, not silently added work.
6. **Focused regressions, then manual acceptance:** use deterministic meaningful logic and owned-boundary lifecycle gates, synthetic transport/input cases, capture transitions and recovery fixtures. Cover a contract once; no UI rendering/interaction, timing, constant/schema, or forwarding-only tests. Run relevant typechecks/builds and opt-in process-backed plugin integration for loading, identity, packaging or dependency changes—not unrelated full suites for style/UI edits. Human acceptance must cover dirty navigation, simultaneous editors, warnings policy, native window/quit paths, shell/platform behavior, live supported providers and the installed release gates above.

Reassess stable readiness against the fixed/explicitly accepted findings, exact candidate evidence and completed applicable product/platform acceptance. Passing checks alone are not approval. Commit, push and release remain unauthorized; no tasks have been formally deferred.


## Implementation disposition — 2026-11-16

### Scope and authority

The original 352 lines above are preserved verbatim as historical evidence, including their baseline, recommendations, proposed batches and validation limits. This appended disposition records the subsequent user-approved implementation and Astra's final diff review; it does not rewrite historical findings as current behavior.

Implementation was based on HEAD `342b5210`, which preserves the independent documentation-only models-and-agents commit after review baseline `bd207e04`. The user approved four convergence packages and independent small fixes, including the public `ShellServices.capture()` contract and `ProviderUsageError.configuration` classification. The following mapping accounts for all R01–R19 and the related connection-watch evidence at their owning boundaries:

| Approved grouping | Finding disposition |
| --- | --- |
| Lifecycle, cancellation and connection ownership | **R01:** session deactivations drain before shared infrastructure disposal; structural cleanup failures remain visible through runtime exit and parent shutdown handoff. A cleanup failure aborts the current quit/restart/update request. A later explicit request may proceed when the runtime child is already null, without retrying cleanup. **R02:** shell cancellation and timeout ownership remain through output settlement, including explicit post-foreground-exit stop; ordinary successful foreground exit does not itself terminate background work. **Related connection-watch evidence:** established watches and pending admission follow their owning connection, preserving replacement ownership without cancelling business work. |
| UI draft, identity and confirmation ownership | **R03:** Settings departure uses existing dirty-editor guards. **R04:** replacement renderers use captured runtime plugin composition, separate from next-startup management state. **R05:** Agent/role external Save buttons and forms share per-instance IDs. **R06:** Role fields are disabled while saving. **R07:** MCP detail submission uses the current saved enabled state without changing public replacement semantics. **R13:** model controls and their associations use per-editor IDs. **R14:** disposal warnings distinguish loading, ready and error; loading waits, while warning-read failure exposes explicit “Continue anyway.” History's required target/leaving-resource read remains independently blocking, with its original `readFailed` feedback and user retry. Only after that necessary history data is ready can warning failure permit explicit continuation. |
| Captured shell and credential/OAuth boundaries | **R08:** the approved public captured-shell handle binds Directory execution to the request environment while preserving cancellation ownership. **R09:** configured usage queries apply the existing transport rule before credential/provider access, with the approved configuration-error classification. **R10:** malformed OAuth callback URL parsing is contained at the listener callback and uses the existing invalid-callback response without completing authorization. |
| Recovery preparation and snapshot ownership | **R11:** restored-data pause gates required host and plugin migrations before recording/applying them and remains a top-level preparation failure. **R12:** the first plugin migration in an invocation takes a fresh point; blocked-host retries may reuse their prior point; migrations in the same invocation share the chosen point. The original retention of seven recovery points is unchanged. |
| Independent small fixes | **R15:** QQ token requests use the authentication endpoint separately from resource requests. **R16:** Exa/Parallel malformed responses use the existing protocol-error parser. **R17:** tree reconciliation distinguishes unloaded/unknown descendants from authoritative absence before pruning expansion. **R18:** attachment drop/paste feedback and admission include uploading, preserving event consumption and preventing workbench fallthrough. **R19:** audit comments and engineering prose describe queued writes, orderly draining and abrupt-interruption limits without claiming stronger durability. |

No OS-defense layer, automatic retry mechanism, new dependency, storage-format change, C01–C07 cleanup or Sentry implementation was included. The seven cleanup opportunities remain observations, neither implemented nor converted into formally deferred tasks. No new todo/ref records or changes to existing acceptance-record status accompany this disposition.

### Implementation validation and final review

The implementation work reported these completed checks; this disposition-only operation did not rerun them:

- Final `npm run typecheck`: passed.
- `npm test`: **252 files, 1,608 tests passed**.
- `npm run test:plugins`: **4 files, 27 tests passed**.
- `npm run i18n:check`: host **986/986**, builtin **960/960** zh-Hans messages translated.
- `npm run build` and `git diff --check`: passed.

Initial validation was not clean: typecheck found the missing builtin usage configuration message, and the unit run had **1,606 passed / 2 failed** because awaiting an empty deactivation set delayed existing synchronous cancellation. Both causes were corrected without weakening tests, then the full checks above passed.

Astra's final review caught a History precursor that incorrectly allowed a required leaving-resource read error to be bypassed. The History-only correction restored the original required-read disable/error/user-retry behavior and retained explicit continuation only for warning failure after target data is ready. After this UI-only correction, typecheck, build and diff whitespace checks were rerun and passed; the full suites were not repeated, consistent with the repository's UI validation convention. Astra read the actual final correction and confirmed that the approved changes have **no remaining commit blockers**. Astra's independent review did not rerun the 1,608 tests. Shell regressions use abort/output event gates; timeout lifetime was source-reviewed, not platform-tested.

Astra's completed full-diff review and final confirmation fulfill the user's conditional authorization for the parent to commit the approved changes. This record operation performs no staging, commit or push. Commit approval is **not stable-readiness approval**.

### Acceptance boundaries retained

Native GUI/editor behavior, IME, simultaneous forms, all warning states, macOS reopen/quit/update UI, actual Windows/Linux process/install/update/native-helper behavior, and live QQ/provider/OAuth behavior remain manual acceptance. Automated checks and source review do not replace that acceptance.

Sentry, actual first-user-distribution history, exact-candidate evidence, packed SDK/external-plugin acceptance and stable-promotion gates remain separate. Next-version migration obligations depend on actual distribution history; this disposition does not establish a published compatibility baseline. Existing acceptance records remain authoritative for pending work and their statuses are unchanged. This record neither authorizes nor establishes release, publication, push or stable readiness.

### Record-only checks

Checked English semantics, terminology and standalone readability; verified that the original 352-line content is an exact byte prefix of this archive and that the appended document has no whitespace errors. No repository references to the original review path were found. Only this review's archival move and appended disposition were changed by this operation; pre-existing implementation, documentation and untracked work were preserved, with no source or public-API edits.
