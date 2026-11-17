# Remaining runtime and resource work

## Closure on 2026-11-17

Archived by user decision. The implemented runtime/resource foundation is accepted as the disposition of this umbrella plan. The user confirmed that the resource-access, restoration, and cloning questions are settled; they are not outstanding generic redesign requirements. This closure does not add checkpoint rollback or external-instance cloning capabilities.

Unchecked entries below preserve the earlier scope, not a remaining backlog. Hypothetical protocols, media, sharing, recovery scenarios, and scale work do not keep this plan open and are not copied into replacement tasks. Revisit a concrete requirement or observed defect when one exists. Existing independently scoped plans retain their own status. Previously recorded implementation and acceptance limits remain historical evidence.

## Historical scope and evidence

Filed on 2026-10-01.

The implementation now includes model requests, tool batches, persistent drafts and steering, agent creation/communication, cross-session Mesh channels, Subagent Pool execution, context compaction, filesystem search and commands, terminals, MCP, Web, skills, naming, archiving, and conversation virtualization. These capabilities must not be treated as absent because early task notes predated their implementation.

Mesh provides member discovery, messaging, saved-record investigation, task profiles, and persistent name disambiguation across sessions. Directional links determine access and membership, captured at request boundaries. The user has accepted real Agent/Mesh collaboration tasks.

## Product and extension decisions

- [ ] Decide the formal resource catalog, creation paths, and resource-access interaction; validation examples do not settle the final catalog.
- [ ] Clarify direct-file resource identity versus locating a file within a directory.
- [ ] Design captured virtual resources, checkpoints, explicit state restoration, and isolated restored instances.
- [ ] Add explicit cloning or reference-mapping capabilities when a concrete resource needs external-instance or private-state duplication. Data-copy templates already require resource participation and selected current-data contracts.
- [ ] Extend context-file discovery, hierarchical scope, ordering, and diagnostics where real tasks require them.
- [x] Accept Subagent Pool GUI behavior and live-provider execution, including shared task observation, steering, cancellation, and retained results. The user confirmed acceptance on 2026-10-31; implementation and validation are recorded in `plans/archived/todo-2026-10-29-subagent.md`.

Subagent Pool execution is asynchronous, with pool-owned resource access and AgentRole configuration. The obsolete role-level tool policies and fallback-role configuration have been removed. Additional relay behavior and skill composition require concrete needs beyond the implemented pool and Mesh capabilities.

Plugin prompt contributions and plugin-carried skills are implemented. Skills settings-page acceptance remains pending. Composer skill selection and reference chips are implemented. Remaining reference conveniences are tracked in `plans/todo-2026-11-05-composer-reference-chips.md`; the superseded skill-picker record is archived.

## Model and context follow-up

- [ ] Add native-protocol continuation namespaces when introducing another protocol, including selection and opaque-data whitelists.
- [x] Add manual conversation compaction. Commit `3502988c` implements the command, independent compression task, and cancellation handling. Configurable budgets remain a possible demand-driven extension, not an open task in this record.
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
- [x] Accept cross-platform filesystem, permission, and symlink behavior as part of the user's cross-platform acceptance on 2026-10-31.

Current content collection and application recovery are implemented. Storage migration and recovery acceptance were confirmed by the user on 2026-10-31 and are recorded in `plans/archived/todo-2026-10-12-storage-migration.md`. Resource-state restoration is a different capability. Last-write-wins is the agreed local-write behavior; this task does not authorize reinstating file revision conflicts or speculative commit rechecks.

## Workbench and scale acceptance

- [x] Accept hidden-card recovery, concurrent-branch navigation, authorization write failure, and feedback during navigation.
- [x] Accept narrow windows, keyboard access, focus, and both schemes for object/access/history panels.
- [ ] Measure large history queries, branch density, and many simultaneously visible cards. Conversation virtualization does not establish bounded database reads.
- [x] Exercise real Agent/Mesh collaboration and tasks using MCP, Web, terminals, and skills.
- [x] Decide and implement runtime log retention: daily/20 MiB rotation with a fifteen-day retention policy (`6869cd02`), recorded in `plans/archived/todo-2026-11-10-log-rotation.md`. Other diagnostic ideas are not committed work in this record.

The checked workbench and real-task items are user-confirmed acceptance. Large-scale measurements and long-conversation compaction quality remain separate follow-up.
