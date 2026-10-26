# Event delivery and plugin communication

Filed on 2026-10-13.

Typed events, ordered delivery, snapshot coalescing, source stamping, lifecycle, session-title updates, and resource-status badges are implemented. Typed plugin calls were exercised by the built-in question feature.

## Implemented boundaries

Occurrence events retain each occurrence; snapshot consumers can coalesce pending values. Publishing is nontransactional and does not write history. Consumers subscribe and query current domain state rather than depend on replay.

Title events publish actual post-commit changes, including cursor-derived title changes. Resource status remains transient and separate from execution busy state.

Calls validate declared scope and associated object identity, remain independent of action queues, and wait for actual completion during cancellation. They can target objects whose session is not open in the frontend.

Automated checks covered identities, ordering/coalescing, rollback-related publication, failure isolation, cancellation, schema boundaries, disconnect cleanup, and status aggregation.

## Remaining work

- [ ] Manually accept title updates for unopened sessions.
- [ ] Manually accept badge summaries, detail popup, running-state retention across navigation, terminal-state consumption on viewing, and animation continuity.
- [ ] Define a notification event from a real consumer such as copy feedback, including ownership, source scope, severity, and display text.
- [ ] Let plugins publish notification meaning while the application chooses presentation and shows host-stamped source.
- [ ] Replace the built-in frontend's direct notification-library use with that event path.
- [ ] Verify source attribution and presentation with that real publisher.

Progress is available in the resource-status contract. Real producers should report measured progress; agents should not invent percentages. Remaining GUI checks are not implied by automated passes.
