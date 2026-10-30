# Work with subagent pools

A Subagent Pool runs independent tasks and keeps their reports for later retrieval. Several Agents can share a pool. Each task has a short ID such as `sub-1`; the same ID in another pool refers to a different task.

## Connect the pool

Create a Subagent Pool from the workbench resource menu. Expose the pool to the Agents that should use it. Expose directories, notes, terminals, or other resources to the pool to make them available to its tasks.

The submitting Agent's resources are not automatically available to the pool. A pool exposed to another pool can be used by that pool's tasks for further delegation. Reciprocal links allow delegation in both directions.

## Delegate and collect

Inspect the pool to see its tasks, available Agent roles, and operation schemas. Submit a task with an Agent role and explicit instructions, adding background material when needed. The task has its own conversation. It does not inherit the submitting conversation.

An optional model selection replaces the role's model and thinking level together. Otherwise the role's model role applies, and an empty model there uses the default ModelRole's model. Configure that default before delegating. Prompts and budgets come from the Agent role, not from delegation arguments.

Submission returns immediately. Four tasks can execute in parallel; further tasks wait in the pool's queue. Use the returned ID to read status or the final report. Reading does not consume the result. To wait for several tasks, supply their IDs together as the wait target. Waiting has no timeout argument, and cancelling a wait leaves its tasks running.

Tasks can finish successfully, partially after exhausting a budget, with an error, or by cancellation. Read the task outcome separately from the success of the check or wait operation. Instructions that arrived too late to reach the task are listed as undelivered with its result.

## Observe and guide

Open a task from the pool card to see its input, report, and live process. Additional instructions enter its message queue while it is queued or running. They are delivered at request boundaries. A finished task cannot restart; a new delegation is a new task.

Any Agent with access to the pool can observe, guide, or cancel its shared tasks. The pool card also provides steering and cancellation. Closing a task view does not stop its execution.

## History and closing

Submission is recorded immediately. Completion fills the result into that same Delegation record, so any selected history path containing the delegation can read its final result. A path before the delegation does not contain the task. Moving through history does not replay the task or undo its effects on resources.

Completed reports survive application restart. Running conversations do not resume; pending records without a surviving execution are marked interrupted. Removing the pool or closing its session cancels its work and saves available results during cleanup.

Process audits are retained separately for developer investigation. Ordinary task checks read the stored report, not the audit.
