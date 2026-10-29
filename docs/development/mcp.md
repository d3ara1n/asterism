# MCP host

The host owns Model Context Protocol server configuration, credentials, connections, cached discovery, and remote dispatch. The SDK exposes those capabilities to plugins. Builtin's MCP Host resources expose them to Agents through ordinary resource links.

## Shared service and access

Plugins share one application-wide server collection. Each server has at most one connection and one stdio process at a time. Removing a resource, moving the history cursor, or ending a consuming plugin does not close shared servers. Application shutdown owns their final cleanup.

Linking an MCP Host exposes enabled servers through its fixed resource tools. Remote tool definitions stay inside the MCP module and do not dynamically register protocol tools or host resource-tool implementations.

External server state can be shared across sessions and agents. The host does not promise server isolation or recovery.

## Configuration and authentication

Asterism owns server configuration and connection actions in a host settings page, available independently of builtin. MCP Host cards display shared status and cached tools and open that page. Stable server IDs distinguish identity from editable display names.

Stdio uses an executable and argument array without shell concatenation, with the application environment plus configured overrides. Streamable HTTP supports the declared authentication methods, including headers and OAuth.

Environment values, headers, and OAuth material use the application credential vault, with references retained in host configuration. Changes invalidate affected discovery and connections. A newly created server does not inherit old credentials merely because it reuses an ID.

OAuth discovery, registration, exchange, and refresh use the official SDK. A connection that needs browser authorization waits for the user to start it in settings. Starting authorization opens the local callback listener before the browser and starts a bounded wait. Reopening the browser uses the same attempt and deadline.

The connection transition owns authorization independently of individual transports. Replacing a failed transport preserves the callback listener. A valid callback returns the server to connecting while the SDK exchanges the response and the client loads its tools. Authorization timeout or failure ends the attempt; explicit cancellation returns to disconnected. No separate completion, cancellation, or timeout connection phases are needed.

Callback completion, timeout, cancellation, and application shutdown release the listener and timer. Leaving settings does not cancel authorization. Cancellation from settings closes the shared transition; a single caller cancelling its own wait does not cancel unrelated waiters. Cancelling a connection does not delete saved credentials.

The client advertises implemented capabilities. Legacy transports and unsupported server-initiated features are not implicitly enabled.

## Connection lifecycle and cache

Connection and disconnection transitions serialize per server. Calls can await an existing connecting or authorization transition instead of opening another connection.

Network stages during connection establishment have bounded waits, independent of the browser authorization deadline. These deadlines do not limit remote tool execution.

Eager and lazy differ only in connection timing. Both load persisted discovery. Eager connects in the background at startup; lazy connects for use and closes after its configured idle period.

Cached discovery is independent of connectivity. Reading the cache neither connects nor extends connection lifetime. An established empty directory differs from an unindexed server.

Connect and explicit refresh update discovery through SDK pagination and change notifications. Connection-parameter and credential changes invalidate the relevant cache.

Unexpected disconnects retain a visible error, and a later call can reconnect. Stdio failures include bounded stderr. Shutdown closes SDK transports and owned descendants, then waits for actual cleanup.

## Discovery and invocation

The SDK supplies raw server and discovery state and binds a call handle to its selected server instance and tool. The handle retains that identity throughout the call. Builtin supplies listing, search ranking, inspection presentation, and fixed resource tools.

Remote identity uses `server_id/tool_name`, split at the first slash. Discovery supplies summaries; inspection supplies full descriptions, schemas, annotations, and server instructions.

Search includes unindexed enabled candidates on its first page so discovery can continue after connecting. Explicit disabled or missing server references fail consistently across entry points.

Knowing a valid call shape is sufficient to invoke it; inspection is not an authorization handshake. Local validation uses the remote schema when it can be compiled; otherwise the server validates.

Remote annotations remain descriptive. They do not change the fixed host tools’ execution classification or add a separate remote-tool whitelist.

## Results and failures

Saved results identify the server and tool actually used. Text becomes model text; binary content stages through immutable content ownership. Resource links retain URI information. Structured output retains its original JSON.

Progress uses ordinary tool publication, not new history events. A progress-notification failure does not alter the remote operation’s result.

Identity and argument errors reject before dispatch. Connection and explicit remote errors fail. A dispatched call interrupted with uncertain effects produces unknown outcome and is not replayed automatically.

All entry points use cause-based errors rather than tool-specific catch-all names. Authentication-layer rejection is distinct from an operation that may have reached the remote tool.
