# Conversation body residency paging

Filed on 2026-11-12. The user deferred implementation to a later session.

## Goal

Separate the logical conversation reading range from resident message and tool-result bodies. Reading earlier history or continuing a long, tool-heavy conversation should not permanently retain every body encountered during that visit. Preserve history access, navigation, drafts, and live output.

This is body residency paging, not truncation, context compaction, or another DOM virtualizer. Lightweight record metadata, navigation indexes, and user-created view intent may still scale with history length; total renderer memory is not expected to become constant.

## Starting point

The preceding renderer refactor separates retained object capabilities from session observations, filters conversation body reads to the current Agent's domain records, and retains display projections rather than both raw records and decoded presentation. Provider continuation and request-context diagnostics are excluded from those display projections. This work does not implement residency paging and has not been measured in a newly installed application build.

The remaining conversation read covers its selected start through the current tip. The start stays fixed as records append and moves earlier when the user loads more history. The virtual list limits mounted DOM, but the conversation projection and derived process structures still retain loaded message and tool-result data. Weak references in the shared record store cannot release values held strongly by those readers.

## Decisions before implementation

- [ ] Confirm loading, retry, and placeholder behavior when scrolling or navigating into an evicted body. Preserve the logical browsing range instead of silently hiding earlier messages.
- [ ] Choose page boundaries and a viewport-adjacent residency policy from measured workloads. Account for large individual tool results and long turns; a record-count limit alone does not bound resident bytes.
- [ ] Define the minimum process-summary and navigation metadata needed without retaining full bodies. Confirm whether collapsed process details load on expansion, viewport entry, or both.
- [ ] Decide how loading failures appear without losing scroll position or discarding the current live tail.

## Implementation tasks

- [ ] Separate logical history selection, lightweight presentation/navigation indexes, and resident body pages. Keep snapshot position and branch identity explicit.
- [ ] Read bodies only for the required visible/nearby pages and active output. Release distant completed pages when no mounted consumer needs them; reread through the existing record capability on return.
- [ ] Ensure eviction releases decoded timeline values, tool arguments and outcomes, process-group references, obsolete read results, and other derived strong references—not only raw record-cache entries.
- [ ] Keep persisted record identity, fixed pending observations, and shared finalized-body identity semantics intact. End obsolete read observations on navigation or unmount; expose actual read failures rather than adding automatic retries.
- [ ] Preserve scroll anchoring and useful placeholder measurements across eviction, rehydration, Markdown/code remeasurement, process expansion, and card resizing.
- [ ] Preserve earlier-message loading, user-input navigation, jump-to-latest, output following, and retained disclosure intent without storing body data in the intent table.
- [ ] Keep streaming and unfinished operations resident through the live-to-saved handoff. Release replaced live values after the corresponding saved page is ready.
- [ ] Preserve complete-turn measurements, final-reply copying, response completion flags, and process grouping when a page begins inside a turn or response. Derive compact metadata or read necessary neighbors rather than pinning an arbitrarily long turn.
- [ ] Preserve feedback anchors on non-rendered records, compression markers and retained boundaries, rewinds, and branch switches even when adjacent bodies are absent.
- [ ] Verify that cards and object islands sharing a conversation do not retain redundant full body ranges or evict data still needed by another mounted consumer.

## Validation and acceptance

- [ ] Add focused deterministic tests for range/page selection, residency transitions, anchor calculations, pending/finalized handoff, and branch changes. Each case should identify a concrete paging defect rather than mirror configuration constants.
- [ ] Use synthetic conversations with known payload sizes, including large tool results, mixed Agent/resource records, and unusually long turns. Check both raw-body and derived-projection residency.
- [ ] Compare renderer heap retaining paths and resident body bytes while appending turns, loading earlier history, scrolling away and back, and leaving/reopening sessions. Completed offscreen body data should become collectible instead of tracking all history visited.
- [ ] Distinguish metadata growth, bounded active working-set costs, temporary read overlap, and actual leaked body data. Record workload and measurement conditions; do not infer success from RSS alone.
- [ ] Run appropriate typechecks, focused unit/contract tests, and the normal build. GUI behavior is manually accepted by the user; do not automate application launch-wait-kill cycles.
- [ ] Manually accept scroll stability, process expansion, reading failures/retry, live output following, and navigation in a packaged build before declaring completion.

## Scope boundaries

Fixed startup/dependency costs, syntax-highlighter initialization, canvas card culling, backend history formats, provider protocols, and remote diagnostics are separate work. This task does not authorize dependencies, storage changes, remote reporting, arbitrary history truncation, or changes to context-compaction policy. Confirm any required product interaction or capability-contract change before implementation.
