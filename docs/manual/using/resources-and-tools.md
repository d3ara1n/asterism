# Work with resources and tools

Add a resource to the workbench, then link it to the agent that needs it. On the canvas, drag from a connection point on the resource card to one on the receiving agent card. Resource identity selects the object; the available tool describes the operation.

## Discover an operation

Link and detach notifications identify the affected resource. Models can list linked resources with `resource_list`, inspect a selected resource with `resource_inspect`, and invoke its tools through `resource_call`. Listing includes each resource's own current state without tool definitions. Inspection supplies that state and the tools and schemas available for the selected resource.

Use current descriptions for arguments, internal targets, and result formats. Targets select content, scope, or a resource-specific view. Two resource types can support the same operation with different target shapes.

Resource creation has its own discovery and inspection tools. The available creation entries determine which resources an agent can create. New links become available at the next model request.

## Organize calls with JavaScript

`resource_script` accepts JavaScript as an async function body. Obtain a resource handle with `resources.get(resource_id)`, then invoke its tools as methods: `resource.read({ target, args })`. The handle binds the resource identity, the method name selects the tool, and `target` and `args` retain their ordinary contracts and defaults. Methods return the same structured outcomes as direct calls. Other top-level operations, such as listing, inspection, and creation, use `tools.<name>(args)`.

Use `await` for dependent operations and `Promise.all` or `Promise.allSettled` to submit independent calls together. Sequential tools execute in submission order relative to other sequential tools; parallel tools can run alongside them. This scheduling applies equally to direct calls and script calls.

Each result retains its `kind` and raw `data`. `text(result)` returns the text from its existing model projection without publishing anything. Return the selected JSON value or text directly:

```js
const directory = resources.get("directory-resource-id");
const result = await directory.read({
  target: { path: "README.md" },
  args: {},
});
return {
  kind: result.kind,
  text: text(result),
};
```

Getting a handle performs no tool call and grants no access. Method execution uses the captured request scope and tool support. Handles reserve `then` and `toJSON` for JavaScript interoperability rather than resource operations.

Resource inspection includes each tool's `requiresInteraction` flag. Tools requiring user interaction, such as `ask_user`, use direct model calls. Script tool bindings exclude interaction-required top-level tools, and resource methods reject interaction-required operations. Tools supporting both modes receive a noninteractive execution context in scripts.

Only the final return value reaches the model. History retains the code, child call identities, timing and outcome summaries, and the returned value. Child arguments and outputs are temporary. The execution title summarizes call progress and failures. The body lists calls grouped by tool and resource with repeat counts, timing, statuses, and diagnostics, followed by the return value and the script code.

Each script has an isolated JavaScript environment and the current request's captured access. The host supplies tool calls through a bridge; filesystem, network, and process operations use those tools. An optional `timeout_ms` bounds the whole execution. Ending a script cancels outstanding calls, waits for their completion, and releases the script environment; completed external effects remain.

## Choose material and capabilities

| Resource or input | Use |
| --- | --- |
| Directory | Read, search, edit, and create files, or run commands from a working directory |
| Manual | Browse Asterism guides, public-package examples, and documentation exposed by loaded plugins |
| Note | Keep editable text in the session |
| Terminal | Share an interactive shell and screen between the user and model |
| Web | Search or fetch URLs through configured web providers |
| MCP Host | Access tools from configured Model Context Protocol servers |
| Agent | Send work to another conversation and inspect or wait for its progress |
| Mesh | Discover and contact agents across sessions through a shared channel |
| Message attachment | Supply a file or image as part of a particular input |

Directory and terminal operations affect the actual machine. Check an operation’s result when its effects are uncertain. A history branch does not create an isolated copy of those files or processes.

Directory commands start a fresh noninteractive shell using the application's default shell selection. `shell_profile_list` reports the host platform, configured profiles, resolved executable paths, and default selection. Terminal resources retain their configured profile and report their actual shell instance state through resource discovery and terminal operations.

Directory listings expose references for regular files. A reference identifies a source resource and a location within it. Pass it to an operation that accepts file references, or forward it to another Agent through Send or Mesh. Passing a reference transfers the address; it does not read the file or supply its contents to the receiving model. A consuming operation fetches the file when needed, so later changes are visible and missing files fail at consumption.

The Directory `metadata` tool queries a relative `target.path`, with `.` selecting the resource root. It returns the path, resolved type (`file`, `directory`, or `other`), regular-file size in bytes (`null` for other types), and last modification time as a UTC ISO 8601 string. These fields have the same meaning on every platform. Symbolic links are followed within the resource root; missing targets and broken links return `path_not_found`.

The Directory `save` tool consumes a FileRef and writes its bytes to `target.path`, relative to the linked directory. It supports binary files, creates missing parent directories, and replaces an existing destination only after the source is fully read. A failed or cancelled transfer preserves the previous file. Its result includes the saved byte count and a new FileRef from the directory. User-facing attachment **Save as…** controls instead open the system dialog and allow any user-selected destination.

Notes retain current text. Their earlier tool results may appear in history, but browsing that history does not restore note contents.

Files and notes support anchored edits, full-content writes, and bulk replacement. `edit` changes selected lines using anchors returned by reading, searching, or a previous edit or replacement. `write` supplies complete content. `replace` applies literal text or a JavaScript regular expression to the entire selected target and returns the match count, actual diff, and fresh anchors. Literal replacement text is inserted verbatim; regular-expression replacements support capture groups. A replacement with no matches reports an error and leaves the target unchanged.

Directory and note reads include edit anchors by default. Select a line range with `target.offset` and `target.limit`; the result's `nextOffset` identifies where to continue. Set `target.anchored` to `false` for a view with line numbers only; `read` takes empty operation arguments. Directory and note content searches support the same anchor option. Manual reads and searches return line numbers without edit anchors.

Use `grep` to locate a pattern in a note's current body or in directory and manual files. Its arguments select the pattern, literal or regular-expression matching, case and word matching, surrounding context, and result limit. Directory and manual targets additionally select file globs, hidden and ignore-file filtering, and the output view: matching content, matching paths, or matching-line counts per file.

## Browse a directory

A Directory card shows the directory as a file tree. Each directory is read when it is first expanded, so the card's cost follows what is open, not the size of the directory. `.git` and `.DS_Store` entries are hidden. Refresh re-reads every directory read so far and keeps expansion, selection, and scroll position; directories that no longer exist drop out. The tree does not watch the filesystem, so changes made elsewhere appear after Refresh.

The filter field hides loaded paths that do not contain the text, ignoring case, while keeping the folders that lead to a match. A matching folder keeps its loaded contents visible. Filtering reads nothing new: a directory expanded while filtering is read normally and then filtered.

In a Git working tree, rows show their Git state and the card header shows the staged and unstaged line changes against HEAD within the directory, such as `+114 −514`. Untracked files and binary files add no lines. The header shows nothing when there are no changes, the directory is outside Git, or Git is not installed. Git state is read with the tree and on Refresh. A failed subdirectory or Git read is reported above the tree and leaves the rest of the tree in place.

## Open a directory file

Click a file in a Directory card's tree, or focus the file and press Enter, to open it on the workbench's right. This also works when the Directory card is focused on the left. PNG, JPEG, GIF, and WebP files open in an image viewer with fit-to-window, original-size, and zoom controls. Other files open in the text editor when they contain supported UTF-8 text.

The editor supports text files up to 8 MiB, with syntax highlighting, line numbers, undo and redo, and find and replace. Code font and size follow Appearance settings. Open search with the toolbar or **Cmd+F / Ctrl+F**; search supports case-sensitive, whole-word, and regular-expression matching. Enter finds the next match in the search field and replaces the current match in the replacement field.

Choose **Save** or press **Cmd+S** on macOS or **Ctrl+S** on Windows and Linux. Saving writes the actual file; it does not add a conversation message or change earlier tool results. The editor retains the file's UTF-8 BOM and newline style; mixed newlines use the first newline's style when saved.

Opening another file replaces the editor. Unsaved changes require confirmation before discarding them when switching files, closing, changing sessions, quitting, or reloading the window. Save failures keep the editing buffer available for retry. Files are read when opened; changes made by an agent or another application do not automatically reload the buffer. A later save replaces the file's current text.

In a Git working tree, gutter marks compare the editing buffer with HEAD: green marks show additions, the accent color shows modifications, and small red markers locate deleted lines. Saving retains uncommitted marks. The baseline is read when the editor opens and after saving; external Git operations do not automatically refresh it. Untracked files show additions. Ignored files, files outside Git, and files opened without an installed Git have no marks. A Git read failure leaves editing available and is indicated in the status bar.

## Consult the manual

Add a Manual resource and link it to an agent, or let the agent create one through the resource creation tools. Creation takes no parameters. The resource provides access to application guides, public-package development material, and documentation directories declared by loaded plugins.

The card displays a file tree grouped by source and reads each directory when it is first expanded. Filter loaded paths with the filter field, and use Refresh to re-read the directories opened so far. Click a file, or focus it and press Enter, to open a read-only view on the workbench's right. Text supports selection, copying, syntax highlighting, and search with **Cmd+F / Ctrl+F**. Supported images open in the image viewer. Manual views have no editing or saving controls; files are read when opened.

The agent can list a directory, find files by path pattern, search their contents, and read selected lines. Root entries identify sources: `app`, `sdk`, `builtin-api`, and, when available, `plugins`. Searches at the root cover all sources; a narrower target selects one source or subdirectory. Search globs apply within each selected source directory, and returned paths include their source prefix.

The manual reads files directly from their source locations. Application updates replace application guides; plugin updates replace their own documents. Plugin enablement and directory declarations take effect after restart. The resource stores no document copy, so browsing an earlier session does not select an earlier edition.

## Use network capabilities

Configure web providers in **Settings → Providers**. Link a Web resource to the agent for searches and URL retrieval, or let the agent create one through the resource creation tools with an optional title. Web resources share the application's provider configuration and priority order. Provider capabilities and URL matching determine the service used.

Configure MCP servers in the built-in plugin’s settings. Link an MCP Host resource to the agent to expose the enabled server collection. Server authentication and connection errors appear in that collection; a resource link is not a separate server login.

MCP Host cards show connection status and cached tools. Use their settings entry to connect, refresh tools, or manage authorization. When a server needs OAuth, choose **Start authorization** in settings and complete the browser flow within five minutes. Settings shows the remaining time and lets you reopen the browser or cancel. Leaving settings keeps authorization running. After the browser returns, the server shows **Connecting** until the connection and tool discovery finish.

If authorization expires or fails, start a new connection from settings. Cancelling returns the server to disconnected without deleting saved credentials; **Reset authorization** clears saved OAuth credentials separately.

MCP Host resources share the configured servers. External server state can therefore be shared across agents and sessions.

## Collaborate with another agent

Create or select another agent, establish the required links, and send it the task and relevant context. Access is directional: linking an agent as a resource does not automatically share all of the caller’s resources.

An agent can expose itself to an already linked resource with `resource_expose`, passing the recipient's `resource_id` and `exposed: true`. Passing `exposed: false` withdraws that exposure while preserving the agent's access to the recipient, so exposure can be enabled again later. The recipient must support receiving links. This also applies to Mesh membership and Chat notification delivery. Creation entries that accept `expose_self` can establish the initial exposure during creation. Active requests retain their captured access; subsequent requests use the updated links.

Inspect the available agent tools for sending, waiting, or reading its records. Sending an input and completing the resulting work are separate events.

## Share a Mesh channel

Add a Mesh resource in each participating session and select the same channel in their cards. New Mesh resources select Default. Create and rename channels from the card; selecting a channel requires no copied identifier. Each card shows the number of distinct agents exposed to each channel.

Expose the Mesh to an agent to let it use the network. Expose an agent to the Mesh to make that agent discoverable and operable through the channel. These directions are independent: an agent can receive messages without having a Mesh tool entry or a return route. Use both directions for mutual communication.

The Mesh tools list members, send messages, investigate saved agent records, and read or set task descriptions. Named targets use `{ "title": "Atlas", "id": 1 }`. Omitted `id` means zero. Names and numeric disambiguators are returned separately in member listings and profiles; internal agent resource IDs are not included.

The first agent with a name receives zero. Later agents with the same name receive increasing numbers. A remaining member keeps its number even when another leaves. Once everyone with that name leaves the channel, numbering can restart at zero. These numbers identify current channel members, not permanent agents.

Task descriptions belong to each Mesh resource and agent pair. `get_profile` with a null target reads your description on that Mesh; `set_profile` updates it using the caller's identity and accepts no named target. Names and configured agent types are read from the agents. A caller that is not exposed to the channel has a null profile ID. If multiple Mesh resources expose the same agent to one channel, listings show that agent once and combine its distinct descriptions.

Switching a Mesh's channel keeps its workbench links and local task descriptions. Requests already in progress retain their captured channel and members; the next request uses the new selection. Hiding a card retains membership. Removing its last exposure path or archiving its session removes the member.

## Manage resource views

Use the object panel to find resources and reopen their cards. Hiding a card retains the object. Removing a resource removes it from the current workbench and clears its links; historical records remain.

A dashed link shows that it has been disconnected but earlier requests are still using it. Its number is the remaining request count. A dashed resource card has been removed and is finishing existing work or cleanup. New requests cannot use these removed links or resources. The temporary indicators disappear when the outstanding work ends.

Choose **Rename resource** from a card's action menu to change its title. Models can rename a linked resource with `resource_rename`, supplying its `resource_id` and new `title`. Names are limited to 160 characters and must contain non-whitespace text. Renaming records an event, so historical views and branches retain the names on their own paths. The resource ID, links, and underlying files or paths stay the same.
