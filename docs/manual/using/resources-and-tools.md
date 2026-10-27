# Work with resources and tools

Add a resource to the workbench, then link it to the agent that needs it. On the canvas, drag from a connection point on the resource card to one on the receiving agent card. Resource identity selects the object; the available tool describes the operation.

## Discover an operation

Models can list linked resources with `resource_list`, inspect a selected resource with `resource_inspect`, and invoke its tools through `resource_call`. Inspection supplies the tools and schemas available for that resource.

Use current descriptions for arguments, internal targets, and result formats. Two resource types can support the same operation with different target shapes.

Resource creation has its own discovery and inspection tools. The available creation entries determine which resources an agent can create. New links become available at the next model request.

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
| Message attachment | Supply a file or image as part of a particular input |

Directory and terminal operations affect the actual machine. Check an operation’s result when its effects are uncertain. A history branch does not create an isolated copy of those files or processes.

Notes retain current text. Their earlier tool results may appear in history, but browsing that history does not restore note contents.

## Consult the manual

Add a Manual resource and link it to an agent, or let the agent create one through the resource creation tools. Creation takes no parameters. The resource provides access to application guides, public-package development material, and documentation directories declared by loaded plugins.

The agent can list a directory, find files by path pattern, search their contents, and read selected lines. Root entries identify sources: `app`, `sdk`, `builtin-api`, and, when available, `plugins`. Searches at the root cover all sources; a narrower target selects one source or subdirectory. Search globs apply within each selected source directory, and returned paths include their source prefix.

The manual reads files directly from their source locations. Application updates replace application guides; plugin updates replace their own documents. Plugin enablement and directory declarations take effect after restart. The resource stores no document copy, so browsing an earlier session does not select an earlier edition.

## Use network capabilities

Configure web providers in **Settings → Providers**. Link a Web resource to the agent for searches and URL retrieval. Provider capabilities and URL matching determine the service used.

Configure MCP servers in the built-in plugin’s settings. Link an MCP Host resource to the agent to expose the enabled server collection. Server authentication and connection errors appear in that collection; a resource link is not a separate server login.

MCP Host resources share the configured servers. External server state can therefore be shared across agents and sessions.

## Collaborate with another agent

Create or select another agent, establish the required links, and send it the task and relevant context. Access is directional: linking an agent as a resource does not automatically share all of the caller’s resources.

Inspect the available agent tools for sending, waiting, or reading its records. Sending an input and completing the resulting work are separate events.

## Manage resource views

Use the object panel to find resources and reopen their cards. Hiding a card retains the object. Removing a resource removes it from the current workbench and clears its links; historical records remain.

Choose **Rename resource** from a card's action menu to change its title. Models can rename a linked resource with `resource_rename`, supplying its `resource_id` and new `title`. Names are limited to 160 characters and must contain non-whitespace text. Renaming records an event, so historical views and branches retain the names on their own paths. The resource ID, links, and underlying files or paths stay the same.
