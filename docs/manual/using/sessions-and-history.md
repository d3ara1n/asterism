# Manage sessions and history

A session keeps the history and resources for a piece of work. Continue the current approach, branch from an earlier point, or reuse the setup through a template.

## Continue work

Select a saved session from the sidebar. Its agent cards display conversations for the current timeline. Stop and continue operate on an agent’s execution; switching sessions does not stop it.

Automatic naming uses the utility model when available. Rename the session explicitly when a specific title matters. An explicit user or agent title prevents subsequent automatic naming on that history path.

## Explore another approach

Open the history panel and select a position. Selection lets you inspect history without changing the workbench.

Use the explicit continue action to move execution to that position. Work that depends on the current timeline must finish before the jump. Adding records after the jump creates another continuation, preserving existing descendants.

The jump reconstructs resource presence and links. Current file contents, note text, and external services keep their current state. Inspect relevant resources before continuing from older context.

## Understand context compaction

Long conversations can use a summary of older material in later model requests. Recent material remains in the model context, and the full recorded history remains available.

A compaction marker identifies the summary and reading boundary. Compaction changes the model’s input, not the original history or resource state.

## Reuse a workbench setup

Save a template from the session menu and choose from the objects that support templates. Each resource defines its reusable data: for example, a note keeps its body and an agent keeps its configuration. The template also stores links and card arrangement.

Select the template on **Home** to create a new session. The new session has fresh resource identities and no copied conversation history or running process instances. Referenced external locations still refer to the external world.

## Archive and restore

Archive a session from its menu when it is no longer active. Archiving ends its running resource instances and moves it to the recycle bin.

Open the recycle bin from the session section in general settings to restore an archived session. Archived sessions become eligible for cleanup after the retention period; cleanup runs at application startup.

Restoring makes saved objects available again. External processes start according to their resource implementation rather than resuming a suspended process.
