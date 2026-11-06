# Get started

Begin with a model connection and a session for one piece of work. Asterism stores sessions locally and uses the configured provider for model requests.

## Set up a model

Open **Settings**, then the model providers section under **Providers**. Add a provider connection, enter its credentials, and add a model. A provider preset supplies connection defaults; model discovery can retrieve the models available through that connection.

Check the model’s reasoning/tool settings and context size. Test the connection before starting work. Provider requests, including connection tests, may incur charges.

Model roles make selections reusable. Configure a conversational role for agent work and the utility role for features such as automatic session naming.

## Start work

On **Home**, choose an agent configuration and model, describe the task, and send it. Asterism creates a session and opens its workbench.

Add resources for the work and link them to the agent that needs them. A directory resource enables file operations; a note can hold working material. Attachments sent with a message become part of that input and do not automatically create resource cards.

The agent card shows the conversation and execution progress. Expand a tool entry to inspect its operation or result. Stop an execution when needed; continuing uses the saved work.

## Return to a session

Choose the session from the sidebar to resume working. Changing pages leaves background execution running. Exiting Asterism ends active work; reopening restores saved sessions and resource configuration.

On macOS, closing the window leaves Asterism and background work running. Unsaved edits require confirmation before the window closes. Click its Dock icon or open Asterism again to restore the window with current state. Choose **Quit Asterism** or press **Cmd+Q** to stop background work and exit. On Windows and Linux, closing the window exits the application.

For repeated setups, save a workbench template. For another approach to an existing task, use its history.

## Use application commands

Choose **Commands** from the application menu, or press **Cmd+K** on macOS or **Alt+K** on Windows and Linux. Search by command, group, or plugin name; matching results are ranked by relevance. Open **Settings → Theme** to choose light, dark, or system appearance. A check marks the saved preference separately from the highlighted command. The **Settings** group also offers software update checks. Update download progress and the restart action appear in the same row as the update state changes. Software updates require an installed application.

Plugin groups appear as **Plugin name · Group**. Commands that need a session appear only while viewing a session. Builtin contributes **Auto-rename** under **Asterism Essentials · Session**.

Use the arrow keys to highlight commands and Enter to run an action or open a nested page. Use the return control, or Backspace with an empty search, to return to the parent page. Escape closes the palette. Automatic renaming closes the palette on success and keeps failures visible. Update checks leave it open to show progress; closing the palette does not stop the download. The Agent's separate local command palette uses **Ctrl+K** within the Agent view.
