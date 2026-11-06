# Diagnostics panel read cost

Filed on 2026-11-06. Deferred until a performance problem is observed; no measurement has been taken.

## Candidates

- `useDiagnostics` reads `records.all({ scope })` through `useSessionRead`, keyed on the session snapshot. While the panel is open, every snapshot change rereads all records and recomputes pricing and the overview. If snapshots change often during streaming, this repeats per change. `keepPrevious` is not set, so each reread also returns `data: null` until it settles and may flash the loading state.
- Request details render the selected request's blocks through the non-virtualized `ConversationTimeline`, mounting every block at once. This only applies while one request is selected.

## Investigation

- [ ] Measure snapshot change frequency while a conversation streams with the diagnostics panel open.
- [ ] If rereads are frequent, choose between `keepPrevious`, coalescing reads, or an incremental derivation, and confirm the choice against `useSessionRead` semantics.
- [ ] Check request-detail mount cost on a request with many blocks before considering virtualization.

The auxiliary panel body itself mounts only while open; the card's main content stays mounted under narrow-layout panels to keep scroll, virtualizer, and composer state. `<Activity mode="hidden">` was considered for the hidden content and rejected: `display: none` breaks virtualizer measurement and effect teardown interrupts streaming subscriptions.
