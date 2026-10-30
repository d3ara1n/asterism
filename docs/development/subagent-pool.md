# Subagent Pool

The builtin Subagent Pool owns shared asynchronous tasks. Generic pending operation records preserve their submissions and final results independently of the running conversations.

## Resource ownership

A Subagent Pool is a resource that owns independent, one-shot Agent executions. Several Agents can share a pool through links. Individual subagents are addressed inside the pool and do not become workbench resources or separate sessions.

Resources linked to the pool determine what its subagents can access. Each request captures those links and holds the corresponding capabilities through its model response, tool batch, and cleanup. Submission does not borrow the submitting Agent's resources or inspect its configuration. Another linked pool is an ordinary available resource, so cross-pool delegation follows the same access rules as other resource operations.

The pool's task set is shared. Submission provenance explains origin without establishing private ownership. An authorized consumer can inspect or cancel another consumer's task. Changes by other consumers are normal shared-resource behavior.

## Execution contract

Delegation selects an AgentRole and supplies explicit task material. AgentRole supplies instructions, a ModelRole reference, and execution budgets. Only the model can be overridden for an individual delegation. Resolution uses the explicit model, then the selected ModelRole's configured model, then the default ModelRole's configured model. An absent final model is an error. Execution failure does not trigger a retry with another model.

The selected role and model resolve when the run starts. Each subsequent request captures its resource environment and prompt preparation inputs. The time budget covers model requests and tool execution, beginning after queue admission; queue waiting does not consume it. A configured request limit also applies. Without that limit, time bounds the run.

All delegation is asynchronous. The pool accepts concurrent submissions and runs at most four tasks in parallel. Waiting is a separate cancellable operation over one or more task targets, without a timeout parameter. Cancelling a wait does not cancel its tasks. Reading a failed task or waiting for it to end can succeed as an operation even though the task failed.

A run owns its conversation, queued input, temporary attachments, cancellation, and execution measurements. Steering appends explicit material to the input queue while queued or running; requests consume it at their boundaries. Finished runs do not accept continuation or restart.

The final report is the last text block. Execution outcomes distinguish success, failure, cancellation, and partial completion from budget exhaustion. Usage includes the resolved model and available measurements. External observation can expose the process without inserting it into the submitting Agent's conversation.

## Lifecycle and history

Busy protects timeline-dependent work. Pool execution remains an external process and does not acquire busy merely because it is running. Its requests retain resource capabilities independently. Ending the pool's lifetime cancels its work and waits for actual cleanup. Closing a view ends observation only. Active-work disposal feedback is independent of timeline protection.

A delegation itself is a persistent operation record. Acceptance publishes it at the actual submission position, with its identity and input. Completion fills the outcome into the same record without changing its identity, parent, submission time, or input. There is no separate completion position that can become unreachable on another branch.

Every selected path containing the delegation can read its completed result. A path before the delegation does not contain it. History navigation does not replay or restart its execution. Pending records whose execution was interrupted must be resolved as ended rather than left waiting for a nonexistent runtime.

An ordinary tool call and a delegation both represent one operation with an eventual outcome. Ordinary Agent tool calls can wait in memory until the outcome is known before being committed. A pool publishes its pending delegation earlier because other consumers can inspect or wait on the independent operation. Finalized Agent model blocks keep their existing immutable representation.

Persistent result storage follows the Delegation record and its retained content. The pool does not require a separate result database or an indefinitely retained in-memory conversation. Runtime state can be released after final output and required audit data have been stored.

One resource-bound managed task supervises the queue and its active executions without claiming timeline busy. Shutdown signals that supervisor, cancels queued and active work, and waits for finalization. Disposal warnings report unfinished work independently of busy. A result-storage failure remains visible as a runtime failure until teardown rather than being reported as saved.

## Identity and audit

A short ID such as `sub-1` is a target within one pool. A globally unique run ID identifies the execution for diagnostics. The Delegation record retains both their relationship and the run ID used for audit lookup.

On run termination, internal process records are stored as a JSONL file named by the run ID in plugin-owned storage. Audit files are retained permanently for investigation. Normal result retrieval reads the Delegation record. The audit is not an alternative report delivery channel or a source for resuming execution.

Audit entries preserve the original input, queued and delivered steering, request instructions, finalized model blocks, diagnostics, and completion measurements. Attachments from delivered tool outcomes are copied beside the audit before the temporary content scope ends. Rejected or invented references in tool arguments remain recorded arguments and do not acquire content ownership. Audit failure is an execution failure with any available report retained.

## Observation

Resource listings expose task IDs, concise descriptions, states, and measurements. Task details show the full input, background, and report. Live observation uses an object channel with an initial process snapshot followed by additional finalized blocks and current live blocks. The final process update is delivered before runtime buffers are released.

Changing history can hide a selected delegation without stopping its execution. When it becomes visible again, the observation stream supplies a fresh process snapshot. Closing the view releases its subscription. Completed process data is available in the developer audit; the ordinary retained result remains the Delegation report.
