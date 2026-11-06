# Manage sessions and history

A session keeps the history and resources for a piece of work. Continue the current approach, branch from an earlier point, or reuse the setup through a template.

## Start work

Home displays the selected plugin's starting interface. The builtin entry starts an Agent conversation; another plugin can start with a form, a terminal, or other resources. A session does not require a message or an Agent.

With several entries available, choose one in General settings. If that plugin becomes unavailable, choose another entry. Templates on Home work independently of this selection.

## Organize with folders

Folders group the sessions and templates that belong to the same work. Create one from the sidebar, from the folder control on Home, or from a session's **Move to folder** menu, and give it a name and a color. The folder chosen on Home receives the next session you start there; **No folder** is always available.

The sidebar lists each folder as a collapsible group with its color, followed by sessions without a folder. Move a session from its menu at any time. Deleting a folder keeps its sessions and templates and moves them to **No folder**.

## Continue work

Select a saved session from the sidebar. Its agent cards display conversations for the current timeline. Stop and continue operate on an agent’s execution; switching sessions does not stop it.

Builtin's automatic naming uses its utility model when available. Rename the session explicitly when a specific title matters. An explicit user or agent title prevents builtin's subsequent automatic naming on that history path. Manual naming remains available with other paradigms or with builtin disabled.

## Let inactive sessions sleep

General settings offers automatic sleep after 7, 15, 30, or 90 days, or **Never**; the default is 30 days. Creation and explicit restoration start a fresh interval; opening the session renews it. Incoming messages and Agent work do not renew it. The session you are viewing does not automatically sleep. An overdue session waits for its work to settle before sleeping.

Sleep ends resource runtime lifetimes, including subscriptions, Mesh membership, background jobs, and deadline registrations. It keeps saved state, history, configuration, and links; it does not delete the session. Opening a sleeping session resets its inactivity timer before reattaching resources. Background messages and resource access cannot wake it.

Choose **Keep awake** in a session's menu to prevent automatic sleep. It does not prevent archiving or application shutdown. Sleeping sessions stay in the sidebar, dimmed with a moon icon.

## Explore another approach

Open the history panel and select a position. Selection lets you inspect history without changing the workbench.

Use the explicit continue action to move execution to that position. Work that depends on the current timeline must finish before the jump. Adding records after the jump creates another continuation, preserving existing descendants.

The jump reconstructs resource presence, links, and the session title recorded on that path. A path without a later title assignment uses the entry's initial title. Current file contents, note text, and external services keep their current state. Inspect relevant resources before continuing from older context.

## Understand context compaction

Long conversations can use a summary of older material in later model requests. Recent material remains in the model context, and the full recorded history remains available.

A compaction marker identifies the summary and reading boundary. Compaction changes the model’s input, not the original history or resource state.

## Reuse a workbench setup

Save a template from the session menu and choose from the objects that support templates. Each resource defines its reusable data: for example, a note keeps its body and an agent keeps its configuration. The template also stores links, card arrangement, and which selected objects are open in object islands, including their left-to-right order and widths. Resource-location islands such as editors and previews are not copied. Its folder starts as the source session's folder; change it while saving or later from the template menu.

Select the template on **Home** to create a new session in the template's folder. A template card's preview carries its folder color, and its caption names the folder. The new session has fresh resource identities and restores the saved object islands automatically, with no copied conversation history or running process instances. Templates saved without object islands leave their objects in the canvas. Agents receive newly generated random names, even if the source agents had custom names. Other resources retain their saved names unless their type also generates names for template instances. Referenced external locations still refer to the external world.

## Archive and restore

Archive a session from its menu when it is no longer active. Archiving ends its running resource instances and moves it to the recycle bin.

Open the recycle bin from the session section in General settings to restore an archived session. Set recycle-bin retention to 7, 15, 30, or 90 days, or **Never**; the default is 30 days. Expired archived sessions are permanently deleted only at application startup. Sleeping sessions are not in the recycle bin and do not expire.

Restoring makes saved objects available again and starts a fresh inactivity interval. External processes start according to their resource implementation rather than resuming a suspended process.
