# Remaining runtime and resource work

Filed on 2026-10-01.

The implementation now includes model requests, tool batches, persistent drafts and steering, agent creation/communication, context compaction, filesystem search and commands, terminals, MCP, Web, skills, naming, archiving, and conversation virtualization. These capabilities must not be treated as absent because early task notes predated their implementation.

## Product and extension decisions

- [ ] Decide the formal resource catalog, creation paths, and resource-access interaction; validation examples do not settle the final catalog.
- [ ] Clarify direct-file resource identity versus locating a file within a directory.
- [ ] Design captured virtual resources, checkpoints, explicit state restoration, and isolated restored instances.
- [ ] Add explicit cloning or reference-mapping capabilities when a concrete resource needs external-instance or private-state duplication. Data-copy templates already require resource participation and selected current-data contracts.
- [ ] Extend context-file discovery, hierarchical scope, ordering, and diagnostics where real tasks require them.
- [ ] Verify default agent tool and delegation policies against the available capabilities.
- [ ] Design higher-level delegation/skill composition and relay resources when needed; basic direct communication already exists.
- [ ] Clarify whether and how backup model roles participate in execution.

Plugin prompt contributions, plugin-carried skills, and explicit skill picking remain deferred extension work. Their existence in a design discussion does not establish an exposed API.

## Model and context follow-up

- [ ] Add native-protocol continuation namespaces when introducing another protocol, including selection and opaque-data whitelists.
- [ ] Add manual compaction or configurable budgets when justified by usage.
- [ ] Evaluate over-window retry and repeated-compaction behavior.
- [ ] Measure budget accuracy with small windows, media, and changing environments, including actual cache effects.
- [ ] Decide server-side tools, dynamic plugin-loading requirements, complete request retention, and sensitive-content retention.
- [ ] Define generated media and external-message sender representations when a concrete integration is selected, including execution ownership, history, content retention, and how existing consumers keep their supported behavior.
- [ ] Investigate concrete cancellation, crash, and unknown-effect reconciliation gaps without automatically replaying commands.

Cross-model continuation and compaction are implemented. Long-term quality across provider/model combinations remains observational acceptance, not an unimplemented feature. Additional protocols, authentication, output categories, and message bridges are domain extensions; they do not block delivery of the current SDK or require a generic plugin architecture redesign.

## Content and storage follow-up

- [ ] Define continuous audio/video, richer media output/display, session export, and cross-device synchronization when they enter scope.
- [ ] Design explicit content sharing across objects, plugins, and sessions.
- [ ] Establish creation retry semantics after lost receipts where submission deduplication is not already provided.
- [ ] Investigate concrete power-loss reconciliation across database and files.
- [ ] Verify cross-platform filesystem, permission, and symlink behavior.

Current content collection and application recovery are implemented. Resource-state restoration is a different capability. Last-write-wins is the agreed local-write behavior; this task does not authorize reinstating file revision conflicts or speculative commit rechecks.

## Workbench and scale acceptance

- [ ] Accept hidden-card recovery, concurrent-branch navigation, authorization write failure, and feedback during navigation.
- [ ] Accept narrow windows, keyboard access, focus, and both schemes for object/access/history panels.
- [ ] Measure large history queries, branch density, and many simultaneously visible cards. Conversation virtualization does not establish bounded database reads.
- [ ] Exercise real multi-agent and dynamic-tool tasks, fixing concrete reliability problems.
- [ ] Decide log retention and remaining diagnostic needs.

Basic panel locating/filtering and core model execution received earlier user acceptance. Those confirmations do not cover all listed edge interactions.
