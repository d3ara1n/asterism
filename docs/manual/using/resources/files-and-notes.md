# Work with directories and notes

Directory and Note resources both hold working material, but they serve different purposes. A Directory connects the workbench to files on the machine. A Note keeps editable text inside the session. Choose according to where the material should live and who needs to use it, rather than treating both as interchangeable text attachments.

## Directory: work on the actual files

A Directory is useful for a project, evidence collection, or deliverable that should remain usable outside Asterism. Its operations reach the actual filesystem. Two Directory resources pointing at the same location reach the same files, even when their cards appear in different sessions. A separate card or history branch is not a separate working copy; use separate filesystem copies or Git worktrees when the work needs isolation.

The root gives file operations their scope and commands their initial working directory. It does not confine local programs to that directory or change the operating-system user's capabilities. A narrower root can make a task easier to understand without making a shell into a sandbox.

Sharing a Directory lets participants work on the same current files; it does not copy those files into every Agent's context or establish an editing order. An Agent may still need to read material changed by another participant. Decide who owns overlapping edits when parallel work touches the same output.

### A browser view is not a complete filesystem search

The file tree loads folders as they are expanded. Its filter narrows the paths already loaded; an absent match does not establish that no matching file exists in an unopened folder. Use a filesystem search when the question concerns the whole directory rather than the visible tree.

The open Directory browser watches for changes, but that view is not a background monitor for Agents. A browser refresh and an Agent learning about a change are different events. A refreshed file tree also does not replace an editor's unsaved draft.

### Git views answer a particular comparison

The Changes view compares current files with HEAD. It is useful for reviewing the net result, not for distinguishing everything staged from everything unstaged. Opposing edits can cancel in the displayed diff while Git status still lists a change. Reviewing the diff does not stage, revert, or commit anything.

## Note: keep shared session material

A Note suits an agreed brief, working checklist, or short piece of shared reasoning that belongs with the session rather than in a project directory. Give each participant that needs the note its own access. Mentioning a note in an assignment does not grant access, and editing it is not an automatic notification to every reader.

A Note has one current body. Its earlier tool results can remain in conversation history, but revisiting that history does not restore earlier note text. A note used as the authoritative brief therefore needs an editing convention: who can change the agreement, and when others should reread it. Preserve a separate version when an acceptance decision depends on an earlier wording.

## Distinguish the editor draft from saved material

File and Note editors hold a draft until it is saved. Agents operate on saved material, not on text you have only typed into an editor. Conversely, another participant can change saved material while your editor still shows the draft opened earlier. A later save replaces the current text rather than merging those changes.

This explains why the card, an open editor, and a previous Agent response can disagree without referring to the same version. Before saving over shared work, reconcile the draft with changes made elsewhere. Use the saved resource for current work and the recorded result for what was observed at that time.

Directory file references remain addresses into current files, not frozen attachments. If the file changes before another operation consumes the reference, that operation sees the later bytes. Preserve a stable copy when the work calls for fixed evidence rather than a live source.
