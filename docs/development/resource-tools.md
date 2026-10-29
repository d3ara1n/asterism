# Built-in resource tools

Filesystem, manual, note, shell, and terminal operations share resource dispatch while retaining domain-specific behavior. Their outcomes describe actual results and uncertain effects.

## Text operations

Directories and notes share public read, edit, and write contracts. Implementations supply their own targets and result data.

Read uses absolute source line numbers. Anchored output hashes the complete line before any display shortening. A long-line excerpt identifies its actual range and full length; the anchor still refers to the full line.

Edit validates a batch against one current text value. Replace and delete ranges include both endpoints; insertion retains the anchor line. Append and prepend need no anchor. A stale anchor or overlapping range rejects the batch without writing. Suggested moved-line matches remain retry information rather than silently retargeting an edit.

Successful edits retain the actual unified diff and new anchors. Model feedback can shorten the diff and anchors with explicit omission information. Display budgets do not rewrite the saved result.

Write creates or replaces complete text. Identical text is a no-op. Directory writes can create missing parent directories inside the root.

Filesystem text operations validate UTF-8 and their size budget. Resolve the path within the directory’s real root at operation start. Write through a same-directory temporary file and rename; replacement failure preserves the target. External concurrent writes follow actual processing order rather than revision locks.

Notes store current text in object data. Saving does not append a note-content history or make cursor movement restore earlier text.

## Directory search

Find and grep are read-only resource implementations backed by packaged ripgrep. Every call searches current files; it creates no separate index.

The manual is a separate resource with empty state and parameterless creation. It exposes list, find, grep, and read over a virtual directory of application guides, public-package material, and directories declared by loaded plugins. The host collects those sources and exposes their current catalog through the SDK. Resource state contains neither installation paths nor captured documents. Files remain at their original locations, with installed application sources unpacked for native search. Linking and agent policy determine tool availability as for other resources.

Virtual ancestors list source directories. A source-local target resolves inside that source's real directory. Searches over virtual ancestors visit their descendant sources and share one result limit and byte budget. Globs apply within each selected physical search directory; result paths include the source prefix and can be passed directly to read. A source failure fails the search rather than presenting an incomplete search as complete. File reads use current contents; saved tool results retain their original content.

Targets resolve within the resource root. Recursive traversal does not follow symlinks; an explicitly selected link must resolve inside the root. Returned paths are root-relative with normalized separators.

Find consumes NUL-delimited file paths. Grep consumes ripgrep’s native result formats for content, files, or per-file matching-line counts. Multiple matches on one line count as one matching line.

Hidden and ignore-file controls are independent. Positive globs follow ripgrep precedence; excluded directories prevent traversal into their children. Git internals are excluded. The invocation disables user ripgrep configuration so explicit tool arguments determine behavior.

Content results preserve line identity and compatible edit anchors. Long matching lines show a window around a match; context lines show their beginning. UTF-8 byte offsets convert to text offsets without splitting characters. Invalid UTF-8 is an error, not a substituted identity.

Result limits distinguish matching lines or files from surrounding context. Byte and pipeline-record budgets report distinct stop reasons. Trim context belonging only to an unreturned next match, while retaining context for returned matches.

An incomplete empty search means no results were returned before stopping. Only a completed empty search means no match. Counts describe returned facts rather than guessed totals. Raw search order is not a stability contract; the UI can sort its view.

## Shell profiles and command execution

The host owns shell profile configuration, its settings page, executable resolution, and process execution. The SDK exposes profiles and one-shot commands to any plugin. Builtin's directory exec adapts that capability to its resource and model-facing result. A profile contains the executable, startup arguments, command arguments, and environment overrides. The command is one argument after those configured arguments.

Explicit unavailable profiles fail. Automatic selection searches configured profiles in platform preference order. Listing profiles resolves availability without starting shells or exposing environment secrets.

Directory exec uses the resource as its initial working directory. Commands can change directories or address other system resources under the current user’s privileges. That directory is not a shell sandbox.

Each exec creates a separate noninteractive process with closed stdin and piped output. It captures the chosen profile for that call. Waiting for exit and explicitly stopping a process are different operations.

An optional timeout ends the running command, not its already completed effects. Cancellation and shutdown terminate the owned process scope and wait for actual process and output completion. Detached processes fall outside that ownership.

Output combines stdout and stderr in receipt order, decodes incrementally, and removes terminal control sequences. A bounded tail remains in memory and history. Exceeding the budget streams full processed output to a temporary log with backpressure.

The result records actual termination, exit status, timing, and truncation information. A temporary log is not immutable content and has no long-term retention guarantee.

Zero exit is success; an ordinary nonzero or signal exit is failure. Cancellation before starting is cancelled. Interruption after starting with uncertain effects is unknown. Stopping does not undo side effects.

## Interactive terminals

The SDK exposes interactive terminal sessions backed by the host's PTY, screen, process supervision, and readiness integration. Plugins decide how to represent and use them. Builtin's terminal resource persists its title, initial directory, and profile selection. Its PTY, screen, variables, and jobs belong to the current application run.

A newly created terminal starts automatically. Reconstructed terminals after restart or cursor movement remain inactive until explicitly opened or first used for input. Card hiding and session navigation preserve a running instance; closing the terminal ends the instance but retains the resource.

Resource removal stops new discovery; captured requests retain the instance until their holds are released. Disposal and shutdown end owned processes. Cleanup waits for termination according to the terminal's platform process strategy.

Terminal existence alone does not occupy the timeline. Model input, read, see, and wait calls use ordinary tool history and scope.

## Terminal state and observation

User and model input enter the same PTY in backend acceptance order. Input delivery does not establish command completion.

Prompt integration distinguishes idle, running, unknown, and terminal lifecycle states. Idle means the shell returned to a prompt, not that every background job finished or the last command succeeded. Unsupported integration reports uncertainty.

Injected integration authenticates its markers with an instance nonce and leaves user shell startup files unchanged. Platform scripts and shell-specific login handling belong to the terminal module.

Read can return the parsed screen, retained history, or raw output. Raw output is not a screen snapshot. Ranges describe retained data and truncation explicitly, preserving character boundaries.

See renders a captured backend screen snapshot into immutable image content through the frontend rendering service. It is independent of whether a terminal card is mounted; unavailable rendering fails explicitly.

Wait ends when prompt readiness is observed or its own deadline/cancellation occurs. Ending a wait leaves the terminal running.

## Terminal transport

The backend headless terminal owns parsing and automatic protocol replies. A newly attached view receives a screen reset on the output parsing chain, then ordered incremental frames.

View acknowledgments apply backpressure to PTY output. Hidden views release or acknowledge their frames. Visible views propose dimensions; the backend publishes the accepted dimensions to all views.
