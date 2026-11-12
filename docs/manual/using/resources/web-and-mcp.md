# Use web providers and MCP services

Web and MCP Host resources both connect work to configured services. Web is for finding sources and retrieving page content. MCP Host is for capabilities supplied by external MCP servers. Choose according to the service needed; neither resource creates an independent service account merely by appearing on the workbench.

## Web: share configuration, evaluate returned evidence

Web resources use the application's configured providers and their priority order. Separate Web cards do not select separate credentials or create independent provider configurations. Adding another card is useful for arranging access, not for repairing a missing or misconfigured provider.

Search and URL retrieval can use different eligible providers. Capabilities, URL matching, and provider failures can affect which provider supplies a result. A provider being enabled does not establish that it can retrieve every URL. When results differ from an earlier request or from a browser, consider the provider and returned execution hints rather than assuming both requests saw the same representation of the page.

Retrieved text is evidence of what the provider returned, not a permanent copy of the live site or proof that every requested condition was applied. Preserve the material and its observation context when a decision needs reproducible evidence. A search result can help locate a source without establishing every claim about that source.

Web card activity totals are shared within a session during the current application run. Two Web cards in the same session can therefore show the same activity, and restarting the application resets those totals. They are not separate billing ledgers or a replacement for retained request history.

## MCP Host: shared servers are not private instances

An MCP Host exposes the application's configured MCP server collection. Multiple Hosts share those servers and their enabled state; they are not separate logins or private copies of remote data. A configuration or authorization change can affect work using other Hosts. Removing a Host resource is not the same as removing a server configuration or undoing its external effects.

Give Agents MCP access according to the consequences of the connected services. A server can expose remote writes or local programs running as the current user. A resource link determines which objects Asterism supplies; it does not turn the server into an operating-system sandbox.

### A cached catalog is not proof of a live connection

The Host can show cached tool descriptions before a server is connected. Conversely, a server whose tools have not yet been indexed may not appear as a match in a tool search. Distinguish what Asterism knows about a server's tools from whether that server is currently ready to execute them.

Some servers connect on demand; others need user authorization in MCP settings. Creating another Host does not bypass that authorization. An authorization attempt is also distinct from the subsequent connection and tool discovery, so returning from the browser need not mean the server is ready yet.

### Remote effects outlive their local presentation

A cancelled or uncertain operation is not always evidence that a remote service made no change. If an operation may have sent a message or changed external data, inspect the destination before deciding to repeat it. Closing a card, removing a Host, or returning to earlier history does not roll back the server's state.
