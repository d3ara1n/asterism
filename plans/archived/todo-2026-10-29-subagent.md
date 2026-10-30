# Implement the Subagent Pool design

Filed: 2026-10-29.

## Status

Implementation is complete. The builtin Subagent Pool resource provides shared, asynchronous, one-shot executions, persistent Delegation results, permanent process audits, and live task observation. Execution infrastructure is decoupled from timeline protection, generic pending operation records support one-time persisted completion, and obsolete Agent configuration fields have been removed. GUI acceptance and live-provider verification remain manual.

Phase-one acceptance evidence remains in `plans/archived/todo-2026-10-29-subagent-foundations.md`; its rationale remains in `plans/archived/ref-2026-10-29-delegated-agent-execution.md`. Those records preserve the earlier infrastructure scope and acceptance caveats.

## Ownership and access

The pool is a workbench resource. Subagents are internal executions, not individual workbench resources or separate Asterism sessions. Multiple Agents linked to the same pool share its tasks. Submission provenance is informational; it does not create private task ownership. An authorized consumer can observe, steer, or cancel another consumer's task.

Resources linked to the pool supply subagent access. The submitting Agent's links and runtime state are not read to construct a task's environment. Each model request captures the pool's current linked resources and retains directed request holds through its tool batch and cleanup.

Linking another pool to a pool makes that other pool available to its subagents. Delegation follows ordinary resource discovery and operation dispatch. Reciprocal pool links permit delegation in both directions. No `subagentRoles` list or role-level tool allow/exclude list governs this access. Execution capability filtering, including noninteractive tool handling, remains infrastructure behavior.

The established subagent scope excludes `resource_create` and `creation_*` during tool assembly. This feature-level restriction is independent of the removed role-level allow/exclude lists.

## Task identity and input

An individual task has a short pool-local target ID such as `sub-1`. Pool identity and target ID together select the task. Each actual run also has a globally unique nanoid `runId`, stored in its Delegation record and used to name its audit file. These identities serve different purposes.

Delegation accepts an AgentRole, an optional model override, task instructions, and explicit background material. AgentRole is the existing Agent configuration containing its instructions, ModelRole selection, and execution limits; it is distinct from ModelRole. No parent-conversation inheritance, cwd-based files, budget overrides, prompt overrides, or tool-policy overrides are exposed to the delegating model.

Model resolution is explicit override, otherwise the AgentRole's ModelRole model, otherwise the `default` ModelRole model. If no model is configured there, execution fails. A missing or disabled role is an error, not an instruction to select another role. The pool never asks the submitting Agent for its model or other state. This is configuration resolution, not retry-on-failure behavior; there is no fallback-model retry.

The resolved model is available when entering `running` and is reported with usage even if the request fails. Other role settings come from the selected AgentRole and cannot be overridden by delegation.

## Scheduling and operations

The pool accepts multiple concurrent tasks without an additional submission-count limit. At most four runs execute in parallel. Four is a fixed first-version value, not a user setting or delegation parameter.

Time budgets belong to AgentRole definitions through `maxDurationSeconds`. Builtin budgets are 2,400 seconds for worker and researcher, 900 for explorer, and 3,600 for reviewer and advisor. The budget starts when execution is admitted; queue waiting does not consume it. An explicit request-count limit also applies. A null request limit leaves the subagent bounded by time, without the main Agent's implicit request cap. Budget exhaustion produces `partial`. Execution failure produces `failed`, cancellation produces `cancelled`, and normal completion produces `succeeded`.

Operation contracts:

- `delegate` accepts a task, records the delegation, and returns its short ID. All execution is asynchronous; there is no `background` switch or separate synchronous runner.
- `wait` accepts multiple task targets, such as `sub-1`, `sub-2`, and `sub-3`, and waits until all selected tasks end. It has no timeout argument or timeout outcome. Cancelling the wait leaves the tasks running. A failed task does not make a successful wait fail.
- `check` reads current status or the retained result. Reading is non-consuming. A failed task is still a successful read.
- `steer` appends explicit input to the run's message queue, including while the run is queued for a parallel slot. The run consumes that queue at request boundaries. Finished tasks reject continuation.
- `cancel` requests task termination. Status becomes final after actual execution and cleanup end.

The resource projection exposes task IDs, descriptions, and current status so shared consumers can discover tasks without the original submission response. Tools use the `subagent_` prefix. Check, steer, and cancel accept a single short target ID; wait accepts an array of IDs. The pool card provides a virtualized task list, input and report details, live process observation, steering, and cancellation.

## State, output, and lifetime

Runs have queued, running, and finished phases. Running output contains stream blocks and usage; status describes current activity. Final output contains the last text block as `result` and measured execution information as `usage`, including the resolved model and elapsed time. The prompt specifies the requested report format. Failure, cancellation, and budget exhaustion retain available output with their actual outcome and stopping reason.

Each run owns its independent conversation, message queue, cancellation, and temporary attachment scope. The main Agent's `running` state is unaffected. Subagents have no implicit access to a parent conversation or direct messaging channel to the submitting Agent; they operate through explicitly available resources. External consumers can observe their internal process.

Execution is transient and cannot restart after its turn ends or the application exits. A running pool does not take timeline busy merely to protect its in-memory process. A main Agent awaiting tool results keeps its ordinary conversation busy scope. Pool teardown cancels queued/running work and awaits actual cleanup. Closing a viewer ends its subscription, not the run.

## Delegation records and result retention

Delegation is a capturable fact even though execution is transient. Accepting a task immediately appends a Pool-owned Delegation record at the actual submission position. The record contains task identity, input, and `runId`; it is observable to `check` and `wait` before execution ends. Completion fills the result and outcome into that same record.

The recorded initiation and final outcome are one operation, as with a tool call. A tool call may assemble its complete record in memory before persistence because its caller waits for the operation. Delegation must publish the pending record earlier because other consumers can observe the independently running operation. The difference is publication timing, not a different operation contract.

The Delegation record keeps its original identity, parent, submission time, and input. Completing it does not create another position in the branch. Every path containing that delegation can read its final result; paths before the delegation do not contain it. This avoids a pending delegation on one branch whose only completion is on another branch. Agent model-output blocks remain finalized before they are persisted and are not rewritten by Pool completion.

Results persist in the session timeline rather than a separate task database or a permanent in-memory result cache. Completed runtime conversations and temporary state can be released after record completion and audit persistence. Result retention follows retained history; no result TTL is selected. Content references that survive completion require persistent ownership before temporary scopes close.

Generic operation records publish input through `begin` and persist output through `complete`. Completion validates ownership, preserves fixed-position readers, sends distinct notifications, replaces renderer records by ID, and retains output content atomically. Interrupted Pool runs must end rather than resume, including pending records found without a surviving runtime.

## Audit

Internal execution records support developer investigation of incorrect results, tool behavior, and failures. On run termination, save the process record as a JSONL file named by its unique `runId` in plugin-owned storage. Keep audit files permanently. The Delegation record stores the corresponding run ID; model result retrieval reads the Delegation record, not the audit file.

Audit storage is separate from normal report delivery. JSONL entries preserve original input, queued and delivered steering, request instructions, finalized model blocks, diagnostics, and completion measurements. Delivered tool-result attachments are copied beside the audit before their temporary scope closes. Rejected or invented references in tool arguments remain recorded arguments without triggering attachment copies. Audit failure produces a failed task while retaining its available report. A process killed before finalization cannot provide the same completed audit guarantee as a normal or cooperative termination.

## Infrastructure work completed in this session

- Removed implicit request-count history blocking from resource-bound execution. Caller-owned busy work still protects timeline-dependent operations.
- Added an explicit history-occupancy option for managed tasks while preserving resource ownership and teardown cancellation.
- Cancel owned task/model producers before waiting for directed holds; borrowed tool operations retain their captured instance until completion.
- Preserved retirement blocking while a previous resource instance is still being disposed.
- Kept shared Agent loop exit reasons distinct so callers can map cancellation and budget exhaustion appropriately.
- Removed Agent configuration `subagentRoles`, tool allow/exclude lists, and unused fallback-role configuration, including their settings controls and documentation.
- Added a settings-format conversion that removes only obsolete Agent override fields while preserving configured models, prompts, limits, and presentation preferences.
- Added generic pending operation publication and completion, fixed pending snapshots, transactional attachment retention, completion notifications, renderer replacements, and a workspace-format index upgrade preserving existing records.

Validation for operation-record completion passed both TypeScript configurations, 159 tests across 11 focused files, the production build, and the diff check. Cases cover branch visibility, delayed snapshot reads, observer-triggered completion, nested transaction rollback, ownership, finalized-record rejection, attachment retention across restart, and the workspace upgrade. Code review found no outstanding correctness issues in this scope. GUI behavior has not been manually accepted.

## Completed implementation

- [x] Implement the generic completion of an already-published operation record, including readers, notifications, content ownership, and branch behavior. Preserve finalized Agent block semantics.
- [x] Implement Pool resource lifecycle, fixed parallel capacity, role time budgets, model resolution, one-shot conversations, and per-run input queues.
- [x] Implement resource tools and short target IDs, including multi-target wait, queued steering, and shared cancellation.
- [x] Implement Delegation projection and completion, recovery of interrupted pending records without replay, and release of completed runtime state.
- [x] Implement permanent JSONL audits keyed by run ID and connect finalization failures to normal diagnostics.
- [x] Provide active-work disposal feedback independently of timeline busy, using resource lifecycle presentation.
- [x] Integrate pool summaries and detailed observation with existing resource UI and object channels.
- [x] Validate concrete lifecycle, branch/completion, access-capture, model-resolution, message-queue, and cleanup contracts. GUI acceptance remains manual.

Final feature validation passed both TypeScript configurations, 139 tests across 10 focused files, bilingual catalog checks, the production build, an isolated builtin runtime/renderer/storage package build, and the diff check. Contract cases cover parallel admission, queued and active steering, explicit request budgets, shared cancellation, cancelled waits, persistence and interruption recovery, branch visibility, pool-owned resource access, reciprocal pool delegation, retained partial reports, teardown, and audit attachment ownership.

Review identified an observation offset that needed resetting after a task became hidden by history navigation, and an audit input array that needed copying before conversation growth. Both findings were fixed; the audit input case has a regression assertion. No GUI interaction or live-provider run was performed. Production build warnings about large chunks remain.

Workflow orchestration remains the user's responsibility. Linked pools permit recursive workflows; the application does not infer or repair those workflows. Automatic completion notifications or owner wake-up are not selected.
