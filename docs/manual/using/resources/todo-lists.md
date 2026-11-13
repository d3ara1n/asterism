# Coordinate work with shared Todo lists

A Todo List resource connects a session to a shared task list. Choose it when users and Agents need to maintain the same tasks, including across sessions. A list holds task state; it does not assign a workflow, start execution, or decide whether a result deserves acceptance.

## A resource is an entrance to a list

Shared lists live outside session history. Separate Todo List resources connected to the same list see the same current tasks. The connection is fixed when an entrance is created. Similar resource titles do not establish sharing, and renaming a resource does not change its connected list.

Removing an entrance leaves the shared list intact. Sleeping a session removes its active notification route, not its tasks. Restoring an entrance or revisiting an earlier conversation still reaches current list data, rather than restoring an earlier task state. A previous tool result is evidence of what was observed then, not a saved working copy of the list.

## Keep the task identity distinct from its working description

A task's title identifies the work and stays fixed after creation. Its Markdown content can develop as participants add context, constraints, completion criteria, and references. Changing the task itself means deleting it and creating another, rather than quietly changing what an existing title represents.

The content is a shared description, not an executable instruction format. Participants can agree on sections or conventions without the resource interpreting them. Completion information is separate: it records a result note and who marked the task complete. Editing a completed task's content does not reopen it or rewrite its completion information.

## Claiming records acceptance, not activity

An Agent claims a task for itself; a user can also claim one. The assignee records who accepted the task, while the completer records who confirmed completion. These can be different people or Agents, and an unassigned task can be completed directly.

A task marked in progress does not establish that its assignee is currently running. A paused Agent, a sleeping session, or a failed response leaves the task state alone. Other participants can release it explicitly; the assignee is not an access-control owner. Reopening a completed task clears its current assignment and completion information so it can be claimed again.

Agent attribution includes a stable resource reference and the title captured at the operation. Titles help people and Agents understand who acted; they are not permanent unique addresses. A workflow can use Mesh or another route for follow-up, but the Todo List does not choose that route or resolve its naming policy.

## Notifications leave the next step open

Access to a Todo List and exposure to it are independent link directions. Access makes its tools available to an Agent. Exposing an Agent to an attached entrance makes that Agent a recipient of task creation, completion, and reopening notifications. A recipient still needs its own list access to act on the task.

Notification routes follow active entrances across sessions. Multiple exposure paths to the same list do not produce duplicate delivery to one Agent, and the Agent performing the change is excluded. There is no replay for time spent without an active route. A current query establishes task state when notifications alone are insufficient.

Content edits, claims, releases, transfers, and deletion refresh views without notifying Agents. This keeps ordinary maintenance separate from a request for attention. Participants can communicate a consequential content change through their agreed channel. A completion notification can prompt review, another task, or no action; the resource does not enforce acceptance stages. Replacing a completion note through another completion operation also notifies recipients when the note changes.

## Deletion and retention change shared reality

Tasks can be deleted in any state, even after another participant has read them. A later edit then fails because the task no longer exists. An open editor is a draft, not a reservation; saving it replaces the current content if the task still exists. Participants need an editing convention when they work on overlapping descriptions.

Deleting an entire list can transfer its unfinished tasks to another existing list while preserving their identities and assignments. Completed tasks are removed with the source list. Existing entrances retain their old binding and become unavailable; transfer does not reconnect them or announce transferred tasks as newly created work. Without a destination, list deletion discards all its tasks.

Completed-task retention is an optional storage choice. Unlimited retention keeps completed tasks available for later inspection. A count limit removes older completions when tasks are created or completed, without a timer or individual deletion notifications. A zero limit can remove a task immediately upon completion, so the completion result or notification can remain available when the task itself is already gone. Keep deliverables in an appropriate durable resource when they must outlive task cleanup.
