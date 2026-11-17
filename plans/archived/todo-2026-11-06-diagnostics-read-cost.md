# Diagnostics panel read cost

## Closure on 2026-11-17

Closed without optimization by user decision. The diagnostics body mounts only for the active auxiliary panel (`ObjectSurface.tsx` renders `AuxiliaryPanel` conditionally); it is not a continuously mounted background reader while the panel is closed. Exit animation may briefly retain the outgoing body. The user accepts higher read/derivation/render cost while explicitly using diagnostics and does not consider that an optimization requirement.

No benchmark or virtualization work is claimed. The hypotheses and unchecked investigation entries below are retained as historical context, not open tasks. Reopen investigation only for a concrete observed problem, rather than the mere existence of panel-open costs.

## Historical scope and evidence

Filed on 2026-11-06. The original investigation was deferred pending an observed performance problem; no measurement was taken.

## Candidates

- `useDiagnostics` reads `records.all({ scope })` through `useSessionRead`, keyed on the session snapshot. While the panel is open, every snapshot change rereads all records and recomputes pricing and the overview. If snapshots change often during streaming, this repeats per change. `keepPrevious` is not set, so each reread also returns `data: null` until it settles and may flash the loading state.
- Request details render the selected request's blocks through the non-virtualized `ConversationTimeline`, mounting every block at once. This only applies while one request is selected.

## Investigation

- [ ] Measure snapshot change frequency while a conversation streams with the diagnostics panel open.
- [ ] If rereads are frequent, choose between `keepPrevious`, coalescing reads, or an incremental derivation, and confirm the choice against `useSessionRead` semantics.
- [ ] Check request-detail mount cost on a request with many blocks before considering virtualization.

The auxiliary panel body itself mounts only while open; the card's main content stays mounted under narrow-layout panels to keep scroll, virtualizer, and composer state. `<Activity mode="hidden">` was considered for the hidden content and rejected: `display: none` breaks virtualizer measurement and effect teardown interrupts streaming subscriptions.
