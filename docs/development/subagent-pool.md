# Subagent Pool

The builtin Subagent Pool owns shared asynchronous tasks. Generic pending operation records preserve their submissions and final results independently of the running conversations.

## Resource ownership

A Subagent Pool is a resource that owns independent, one-shot Agent executions. Several Agents can share a pool through links. Individual subagents are addressed inside the pool and do not become workbench resources or separate sessions.

Resources linked to the pool determine what its subagents can access. Each request captures those links and holds the corresponding capabilities through its model response, tool batch, and cleanup. Submission does not borrow the submitting Agent's resources or inspect its configuration. Another linked pool is an ordinary available resource, so cross-pool delegation follows the same access rules as other resource operations.

The pool's task set is shared. Submission provenance explains origin without establishing private ownership. An authorized consumer can inspect or cancel another consumer's task. Changes by other consumers are normal shared-resource behavior.

## Execution contract

Delegation selects an AgentRole and supplies explicit task material. AgentRole supplies instructions, a ModelRole reference, and its budget. A delegation can replace the role's model selection with an explicit model and thinking level; that pair is used as given without resolving the ModelRole. Otherwise resolution uses the selected ModelRole's configured model, then the default ModelRole's configured model, with the selected ModelRole's thinking level. An absent final model is an error. Execution failure does not trigger a retry with another model.

The selected role and model resolve when the run starts. Each subsequent request captures its resource environment and prompt preparation inputs. The budget bounds request count and duration. Duration covers model requests and tool execution, beginning after queue admission; queue waiting does not consume it. Budgets apply only to subagent runs; workbench Agents have none.

All delegation is asynchronous. The pool accepts concurrent submissions and runs at most four tasks in parallel. Waiting is a separate cancellable operation over one or more task targets, without a timeout parameter. Cancelling a wait does not cancel its tasks. Reading a failed task or waiting for it to end can succeed as an operation even though the task failed.

A run owns its conversation, queued input, temporary attachments, cancellation, and execution measurements. Steering appends explicit material to the input queue whether the task is queued by the pool or running; consumers do not need to know which. Requests consume the whole queue at their boundaries. Steering that arrives after the final response began, or when the run ends otherwise, is returned as undelivered with the result. Finished runs do not accept continuation or restart.

The final report is the last text block, and may be empty. Execution outcomes distinguish success, failure, cancellation, and partial completion from budget exhaustion. An interruption from cancellation or the duration budget outranks a thrown error, which outranks the loop's own result. Usage includes the resolved model and available measurements. External observation can expose the process without inserting it into the submitting Agent's conversation.

## Lifecycle and history

Busy protects timeline-dependent work. Pool execution remains an external process and does not acquire busy merely because it is running. Its requests retain resource capabilities independently. Ending the pool's lifetime cancels its work and waits for actual cleanup. Closing a view ends observation only. Active-work disposal feedback is independent of timeline protection.

A delegation itself is a persistent operation record. Acceptance publishes it at the actual submission position, with its identity and input. Completion fills the outcome into the same record without changing its identity, parent, submission time, or input. There is no separate completion position that can become unreachable on another branch.

Every selected path containing the delegation can read its completed result. A path before the delegation does not contain it. History navigation does not replay or restart its execution. Pending records whose execution was interrupted must be resolved as ended rather than left waiting for a nonexistent runtime.

An ordinary tool call and a delegation both represent one operation with an eventual outcome. Ordinary Agent tool calls can wait in memory until the outcome is known before being committed. A pool publishes its pending delegation earlier because other consumers can inspect or wait on the independent operation. Finalized Agent model blocks keep their existing immutable representation.

Persistent result storage follows the Delegation record and its retained content. The pool does not require a separate result database or an indefinitely retained in-memory conversation. Runtime state can be released after final output and required audit data have been stored.

One resource-bound managed task supervises the queue and its active executions without claiming timeline busy. All outcomes, including cancellation before admission, complete their Delegation record through one finalization path. A task cancelled while queued never executes. Shutdown signals that supervisor, finalizes queued work as cancelled, cancels active work, and waits for finalization. Disposal warnings report unfinished work independently of busy. A result-storage failure remains visible as a runtime failure until teardown rather than being reported as saved.

## Identity and audit

A short ID such as `sub-1` is a target within one pool. A globally unique run ID identifies the execution for diagnostics. The Delegation record retains both their relationship and the run ID used for audit lookup.

Executed runs append internal process records to a JSONL file named by the run ID in plugin-owned storage as the run proceeds. Each line is independent, so an interrupted process loses at most its final line. A task cancelled before admission has no process and no audit. Audit files are retained permanently for investigation. Normal result retrieval reads the Delegation record. The audit is not an alternative report delivery channel or a source for resuming execution.

Audit entries preserve the original input, queued and delivered steering, request instructions, finalized model blocks, diagnostics, and completion measurements. Attachments from delivered tool outcomes are copied beside the audit when those outcomes arrive, while the temporary content scope is open. Rejected or invented references in tool arguments remain recorded arguments and do not acquire content ownership. Audit failure is an execution failure with any available report retained.

## Observation

Resource listings expose task IDs, concise descriptions, states, and measurements. Task details show the full input, background, and report. Live observation uses an object channel with an initial process snapshot followed by additional finalized blocks and current live blocks. The final process update is delivered before runtime buffers are released.

Each task keeps a compact activity log of thinking and tool steps in response order, with delivered steering at its position. Tool steps retain their implementation identity so views can show localized tool names. Report text is not repeated there. The log is derived from the live process while the task runs and is saved with its result. Pool task details show the live process while its blocks are available and the saved activity log otherwise.

Check returns an instant snapshot of one task in any state without waiting. Its model output and view carry the same information: current activity and usage while running, or the report, outcome, usage, and undelivered instructions after completion. The running summary describes the current activity and the matching tool's subject, without a step history. Its view remains a frozen snapshot.

Wait returns task identities and states to the model, including terminal outcomes. Activity and reports are absent from its model output. While waiting, its view displays recent activity and usage for running tasks. Finished tasks show only their identifying status row, and the settled wait retains those rows without activity or reports. The pool task details remain the place to inspect the process after completion.

Changing history can hide a selected delegation without stopping its execution. When it becomes visible again, the observation stream supplies a fresh process snapshot. Closing the view releases its subscription. Completed process data is available in the developer audit; the ordinary retained result remains the Delegation report.
