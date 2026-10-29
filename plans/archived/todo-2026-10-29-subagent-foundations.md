# Subagent execution foundations: phase one

Filed: 2026-10-29.

## Disposition

The infrastructure changes are implemented. Subagent tools, background scheduling, report delivery, and audit storage remain open design topics in `plans/todo-2026-10-29-subagent.md`. That record is a brainstorming agenda, not an accepted implementation design.

Design rationale: `plans/archived/ref-2026-10-29-delegated-agent-execution.md`.

## Completed work

- [x] Removed the Agent-ID-to-prepared-skill-list map and request-lifetime wrapper. `skill_read` resolves the current flattened catalog; preparers control prompt presentation.
- [x] Separated generic typed model execution from session/resource binding. The model runner consumes explicit messages, instructions, executable tools, and an observer without workbench presence or cursor requirements.
- [x] Added session-bound execution using a real access owner, independent request identity, per-request environment capture, and explicit interaction capability.
- [x] Removed the per-resource model-request singleton. Concurrent conversations through one owner retain independent messages, content handoffs, and request state.
- [x] Separated optional workbench progress from execution binding through an observer sink selected by the caller.
- [x] Added directed request holds keyed by receiver and offered-resource endpoints. Unlink/removal history immediately affects new requests; existing holders continue through captured capabilities.
- [x] Added transient pending-link projection with directional hold counts and inert removed-resource cards. No persistent pending-operation format or link generation identity was introduced.
- [x] Delayed attachment disposal until related holds drain and cleanup completes. Request occupancy and retirement block history movement separately from resource-owned busy work.
- [x] Kept ordinary resource busy removal restrictions and existing confirmed archive/exit flows. Normal cleanup drains holders; forced process termination remains an existing limitation.
- [x] Added interaction-required declarations, noninteractive discovery filtering and dispatch rejection, and the context flag for dual-mode tools. `ask_user` declares its interaction requirement.
- [x] Extracted request iteration and turn boundaries from builtin's workbench integration. Draft scheduling, persisted compression, history projection/append, feedback, and resource activity remain with the ordinary Agent controller.
- [x] Added temporary content ownership and output transfer for conversations without timeline records, including concurrent handoffs and existing caller content.
- [x] Updated current engineering documentation and plugin authoring guidance.

## Validation and acceptance caveats

Validation covers model execution, tool discovery and rejection, concurrent resource holds, pending disconnection and removal, relinking, independent conversation attachments, failure/cancellation cleanup, and ordinary Agent turn boundaries. Temporary test storage is isolated from real application data.

Code review found and prompted fixes for early preparation-failure cleanup, output retention of existing caller content, focused ghost views, and retirement activity notification. The Mesh history test now waits for retirement completion before selecting a path that reattaches the old identity.

Commit preparation separated the loop and workbench controller modules, moved temporary content contracts to their owning SDK module, removed unused resource snapshots from hold accounting, and eliminated obsolete empty-environment branches. Top-level tool execution now shares request occupancy without marking the borrowed access owner busy; the existing interaction contract test covers this boundary.

Both TypeScript configurations passed. The related execution, SDK/plugin, runtime, resource, session, Agent, and connection-layout suite passed: 57 files, 388 tests. The production build, localization check, and diff check passed. Localization coverage was 827/827 host messages and 609/609 builtin messages.

The dashed cards, directed hold labels, and focus-island transition have not been manually accepted in the running GUI. No GUI launch/wait/kill cycle was automated. A shutdown deadline can still force the runtime process to exit; a recorded removal remaining absent on restart does not prove external cleanup succeeded.
