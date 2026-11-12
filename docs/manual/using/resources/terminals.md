# Share an interactive terminal

A Terminal resource gives the user and Agents access to one interactive shell and its screen. Choose it when the work depends on a continuing shell session or an interactive program. Directory commands are a better fit for independent commands that should start from a known working directory each time.

## Share one foreground program

Everyone using a Terminal sends input to the same foreground program. Input might reach a shell prompt, an editor, a password prompt, or a running application. A resource link does not give each participant its own command channel. Agree on who controls input when a user and an Agent, or several Agents, share the terminal.

Working-directory changes and shell variables persist within that shell instance. They do not automatically apply to commands executed through a Directory resource, which start fresh shells. A command can therefore behave differently in the two places even when both resources began in the same directory.

## Separate input, waiting, and completion

Delivered input is not proof that a command completed. An idle indication means the shell has returned to its prompt when shell integration can report that state; background jobs may still be running. Judge completion from the program's output and the intended result, not only from whether the prompt is visible.

Cancelling an observation or wait does not stop the foreground program. This distinction matters when stopping an Agent response: a terminal program it started can continue. Decide whether the intent is to stop waiting, interrupt the program, or close the shell, since those have different effects.

## A saved resource is not a saved process

Hiding a Terminal card or viewing another session leaves its shell available while the resource's session remains running. Removing the resource, sleeping or archiving its session, or exiting Asterism ends that shell instance and its child processes.

The saved resource retains its configuration, not a suspended shell or a permanent terminal transcript. Restoring the resource after restart or session restoration does not recover the previous process, shell variables, or screen buffers. A newly started shell is a new instance. Preserve important output in files when it must outlive the terminal.

Terminal programs run as the current operating-system user. Sharing a terminal is consequently a decision about real local execution, not merely about sharing a visible screen.
