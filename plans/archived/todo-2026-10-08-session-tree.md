# Flat session-tree implementation

Filed on 2026-10-08 and archived on 2026-10-10 after implementation review. Outstanding capabilities were deferred rather than counted as complete.

The migration replaced per-Agent conversation storage with a session-owned append tree. Agent selection belonged to its resource. Model output grouped by request and ordinal, while historical append order retained interleaved workbench events.

Streaming increments remained temporary. Incomplete blocks and tool outcomes had explicit persistence behavior. Resource creation/removal and directed links rebuilt the workbench along the selected path.

The implementation added resource discovery/inspection/call entries, shared tool contracts, implementation-specific targets, independent resource and tool registries, and plugin-organized backend/frontend views.

Request path, configuration, and access were captured per model request, correcting the earlier whole-turn boundary. Response projection placed intervening events after the associated response to retain the previously sent prefix.

Typechecks and contract tests covered projection order, incomplete output, interleaved agents, settled-state checks, transactions, and submission behavior. Later review added cursor-selection records and stable display identity.

Some delivered mechanisms in this record were later replaced: historical preview state, continuation snapping, separate completion storage, revision-based synchronization, and restricted top-level registration. They remain historical facts.

Deferred questions included dynamic-tool reliability, real-protocol continuation edges, agent communication and skills, captured-resource events, direct-file identity, and formal resource selection.
