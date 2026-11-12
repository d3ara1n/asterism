# Delegate bounded work with a Subagent Pool

A Subagent Pool is useful when a piece of work can be assigned independently and brought back as a report. Use continuing workbench Agents when the relationship itself needs an ongoing conversation. Delegation should reduce coordination effort, not make the task harder to account for.

## Choose an independent assignment

Good delegated tasks have a clear question, a useful stopping point, and an output the recipient of the report can evaluate. Parallel work helps when investigations can proceed independently. Work with tightly coupled edits or unresolved shared decisions may benefit more from one continuing context.

A task starts with the material supplied in its assignment, not the submitting Agent's entire conversation. Include the goal, relevant decisions, constraints, and expected evidence. A role supplies expertise and working standards; it does not supply missing task context.

## Arrange access separately from responsibility

Make the pool available to the Agent that should delegate work. Separately, make directories, Notes, Terminals, or other working resources available to the pool. These links express the resources its tasks can use; they are not links to individual task views. For example, a Directory linked only to the coordinator remains unavailable to its delegated task until the Directory is also made available to the pool.

The submitting Agent's access is not inherited simply because it assigned the work. A task's role can further restrict the resources it uses. Responsibility for investigating a directory and actual access to that directory are separate parts of the setup. A pool shared by several delegators supplies a common resource environment rather than a private copy of each delegator's links. Changes to that environment apply to later model requests, not to a request already in progress.

Delegation policy is another boundary. A role can be suitable for receiving an assignment without being allowed to delegate further. Decide whether nested delegation serves the task and which decisions remain with the original coordinator or user.

A pool made available to another pool can support further delegation when the task roles permit it. Sharing the first pool does not implicitly make every other pool available. A parent task ending, being cancelled, or exhausting its budget does not automatically cancel tasks it has already delegated. Those tasks belong to their receiving pool, so agree who tracks and stops outstanding work when a coordinator ends.

A shared pool is a shared coordination surface. Agents with access can observe and guide its tasks, so use that arrangement when they should share responsibility for the work rather than assuming private ownership by the submitter.

## Design the report before execution

A useful report makes its scope, evidence, conclusions, and unresolved questions clear enough for someone outside the task's conversation to use. Define completion in terms of the work, not merely the existence of a final response. Independent execution does not automatically provide independent validation.

An execution budget bounds effort; it does not prove completeness. A partial report can contain valuable findings while still leaving the assignment unfinished. The coordinator decides whether to narrow the question, continue in another assignment, or return a decision to the user.

## Guide the work deliberately

Additional instructions should change the task's goal, constraints, or available context for a concrete reason. A task that is still running or has not produced a new visible step is not by itself evidence that its direction is wrong. Consider whether a correction is needed before interrupting its existing reasoning.

Waiting for a task and owning its execution are different relationships. Ending a wait need not end the task, and a report can remain useful to several participants after execution finishes. Agree on who follows through rather than relying on the submitter's continued attention.

A task's view is not a continuing workbench Agent. Closing the view does not stop its task, and a completed task cannot be restarted by sending another instruction. Further work is a new assignment with a new conversation. Instructions sent too late to reach a finishing task are reported as undelivered, not silently incorporated into its result.

## Keep reports distinct from effects

A report is a retained account of work. Changes to files or external systems are effects on current resources. Reports are visible on history paths containing their delegation; they are not historical copies of the affected files. Revisiting a report does not rerun the task or undo those effects.

Treat interrupted execution as something to assess, not automatically resume or repeat. Use the available report and current resource state to decide what work remains. A fresh assignment should state that remaining scope rather than silently assuming the earlier task did nothing.

## Account for the pool's lifetime

The pool owns queued and running tasks. Removing the pool, sleeping or archiving its session, or exiting Asterism ends that execution and saves available outcomes during cleanup. Merely hiding its card or switching sessions does not stop it. A coordinator ending its wait is not the same as ending the pool.

Completed reports survive application restart, but running task conversations do not resume. A pending delegation with no surviving execution is marked interrupted. A task ID belongs to its pool, so keep the pool identity with any report reference.
