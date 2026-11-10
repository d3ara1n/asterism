# Event delivery and plugin communication

Filed on 2026-10-13.

Typed events, ordered delivery, snapshot coalescing, source stamping, lifecycle, session-title updates, and resource-status badges are implemented. Typed plugin calls were exercised by the built-in question feature.

## Implemented boundaries

Occurrence events retain each occurrence; snapshot consumers can coalesce pending values. Publishing is nontransactional and does not write history. Consumers subscribe and query current domain state rather than depend on replay.

Title events publish actual post-commit changes, including cursor-derived title changes. Resource status remains transient and separate from execution busy state.

Calls validate declared scope and associated object identity, remain independent of action queues, and wait for actual completion during cancellation. They can target objects whose session is not open in the frontend.

Automated checks covered identities, ordering/coalescing, rollback-related publication, failure isolation, cancellation, schema boundaries, disconnect cleanup, and status aggregation.

## Accepted

- [x] Manually accept title updates for unopened sessions.
- [x] Manually accept badge summaries, detail popup, running-state retention across navigation, terminal-state consumption on viewing, and animation continuity.

## Notification follow-up disposition

The following proposals were not implemented and were withdrawn on 2026-11-10. They remain here as the historical follow-up scope, not outstanding work.

- [ ] Define a notification event from a real consumer such as copy feedback, including ownership, source scope, severity, and display text.
- [ ] Let plugins publish notification meaning while the application chooses presentation and shows host-stamped source.
- [ ] Replace the built-in frontend's direct notification-library use with that event path.
- [ ] Verify source attribution and presentation with that real publisher.

Progress is available in the resource-status contract. Real producers should report measured progress; agents should not invent percentages. Remaining GUI checks are not implied by automated passes.

## Closure

Archived on 2026-11-10. The implemented event, call, title, and resource-status capabilities retain their recorded acceptance.

### Decision: no unified notification service

Asterism will not introduce a unified notification service that gives all feedback one common shape. Each feature owns the form of its notifications and feedback according to its interaction and domain context. A task outcome, connection failure, and copy result need not share a presentation, lifecycle, or source-label policy.

The event bus remains shared communication infrastructure, not a unified user-notification service. Sharing the Sonner implementation and application-level visual configuration likewise does not turn every feature's feedback into one notification model.

Background task outcomes may use session status, resource views, Sonner, or other contextual feedback. Connection failures likewise use the presentation appropriate to their owning feature. Shared UI controls and plugin frontend views may call the shared Sonner instance directly for local interaction feedback; those calls do not require event-bus migration or plugin-source labels.

No notification contract, blanket frontend migration, or dedicated notification-publisher acceptance remains required by this plan. This disposition withdraws those proposals rather than claiming they were implemented or manually accepted.
