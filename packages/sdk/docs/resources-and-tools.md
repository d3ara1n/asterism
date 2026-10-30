# Add resources and tools

A resource represents an object with identity and lifetime. A tool represents a model-callable operation. They can evolve independently.

## Add an object

Use a resource for something that belongs in a session and can be inspected or operated on. Define how it is created, what state it owns, and what information it presents.

The resource attaches when it becomes present in a session. Removal immediately ends discovery and cancels its managed tasks and model requests. Other owners' requests holding the resource can finish before its attachment lifetime ends and the instance is disposed. A hidden card does not imply that its backend instance should stop.

Creation supplies initial state. Actions change the object through typed application or plugin operations. Views present the resulting state.

Implement `inspect` to expose model-facing resource state. The host includes this state in resource listings and individual inspection results; individual inspection also supplies available tool definitions. Link notifications contain identity only. Return the information needed to recognize and use the resource without relying on the host to interpret its saved state.

Resource titles belong to session history. Use the session's rename operation with a resource reference to change a title; the host appends the event and reconstructs names along each history path. Tool sessions accept a resource ID within the request's captured links. Existing snapshots keep their captured titles.

Declare `links: { receive: true }` in the backend resource implementation when the object can receive directed links. The host supplies this capability to the workbench's connection controls and authorization panel. Renderer resource descriptions supply labels, icons, and card geometry; link reception needs no frontend declaration.

Use a session snapshot to query the resources directly linked to a receiver. Results contain resource references, titles, and public data on that snapshot's timeline path. Reverse links and links through another resource are independent. For external event handling, such as forwarding network messages to linked agents, read a fresh snapshot for each event. Session observers can also query their supplied snapshot after commits or cursor changes. The query exposes relationships without granting access to private state or expanding a model request's operation scope.

## Add a model operation

Use a resource tool when an operation targets a linked object. A shared tool can have implementations for different resource types, each with an appropriate internal target and result.

Choose a tool name for the operation's meaning. Reuse an existing tool declaration when its semantics and operation arguments fit another resource; supply that resource's target and result schemas in its implementation. A distinct operation contract needs a distinct name. Domain qualifiers can clarify scope, such as `terminal_input` for terminal interaction, and remain useful when multiple resource types support that operation. Choose qualifiers according to the operation's meaning, independently of whether its declaration is public or where its code lives.

For model calls, `resource_id` selects the resource, `args` supplies the operation's parameters, and `target` selects what the operation acts on within that resource. The same tool preserves its meaning and `args` schema across resources. Inspection exposes the tools available on the selected resource and their argument, target, and result schemas.

Use a top-level tool for operations on the execution context or shared resource lifecycle, such as creation and renaming. The host supplies caller identity and execution scope.

Describe the operation's purpose and observable behavior. Parameters should explain business meaning that names and types alone do not express. Results should distinguish known success, failure, cancellation, partial output, and uncertain effects.

A tool contribution can capture resource-specific configuration and access at the start of each model request. Return a bound contribution using the same implementation contract; the host uses it for that request's tool batch. This is useful for a resource whose selected network or reachable objects can change while a model is responding. Capture addressing and authorization facts, while reading ordinary mutable content when the operation runs.

Declare `requiresInteraction: true` when a tool cannot complete without user interaction. The host excludes it from noninteractive requests and rejects unsupported calls before entering the implementation. Tools supporting both modes can inspect `interactive` in their execution context. A renderer that only displays progress or results does not make a tool interactive.

Use `plugin.execution.run` to execute one model request with tools bound to a resource's current links and the real session. Supply that resource as the access owner and select the interaction capability. The execution holds captured relationships through the tool batch; subsequent calls capture current links again. Calls sharing an access owner keep independent message inputs and can run concurrently.

Resource holds do not block history movement. Use an object busy scope for work that depends on the timeline, such as a conversation writing its responses there. Object-bound managed tasks protect history by default; use `affectsHistory: false` for external runtime tasks that should still stop when their owning resource leaves the session.

Use `plugin.models.run` when supplying messages and executable tools directly. It needs no workbench resource or timeline. Both forms deliver execution records to the observer you provide. `plugin.execution.withProgress` supplies an optional workbench observer for the events you choose to display.

For a temporary conversation, use a content scope to retain generated attachments across requests. Pass it as the input reader and output owner for session-bound execution. Persistent records or a longer-lived scope must retain any surviving results before the temporary scope closes.

## Connect other interactions

Typed calls connect request and response between services or views. Events announce transient changes. Object channels support sustained data such as an interactive screen.

An action or service call is not automatically a model tool. Expose it deliberately when the model needs that operation.

## Use shell capabilities

Backend plugins access shell profiles, one-shot execution, and interactive terminals through `plugin.shell`. Profiles are shared host configuration: `profiles.get()` reads that configuration, while `profiles.list()` resolves executable availability. Plugins choose how to expose these capabilities through their resources and tools.

Use `shell.execute(cwd, args, options)` for a noninteractive command with piped output, progress, and a final result. Each execution owns its process; cancellation or timeout stops that execution without undoing completed effects.

Use `shell.terminals.create(config, events)` for a persistent interactive session. Start the returned handle when needed and register its disposal with the owning resource or plugin lifetime. Closing a terminal permits reopening the handle; disposing it releases it permanently. Input and readiness waits are separate operations, and cancelling a wait leaves the shell running.

A terminal can serve several views through its typed input/output messages. Plugins connect viewers through object channels and choose their own presentation. Backend reads expose screen text, retained output, or character-cell image data. The host owns the PTY and screen state; a terminal handle does not create a workbench resource or model tool by itself.
