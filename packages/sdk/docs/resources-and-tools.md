# Add resources and tools

A resource represents an object with identity and lifetime. A tool represents a model-callable operation. They can evolve independently.

## Add an object

Use a resource for something that belongs in a session and can be inspected or operated on. Define how it is created, what state it owns, and what information it presents.

The resource's lifetime follows its presence in the session. A hidden card does not imply that its backend instance should stop.

Creation supplies initial state. Actions change the object through typed application or plugin operations. Views present the resulting state.

Resource titles belong to session history. Use the session's rename operation with a resource reference to change a title; the host appends the event and reconstructs names along each history path. Tool sessions accept a resource ID within the request's captured links. Existing snapshots keep their captured titles.

Declare `links: { receive: true }` in the backend resource implementation when the object can receive directed links. The host supplies this capability to the workbench's connection controls and authorization panel. Renderer resource descriptions supply labels, icons, and card geometry; link reception needs no frontend declaration.

Use a session snapshot to query the resources directly linked to a receiver. Results contain resource references, titles, and public data on that snapshot's timeline path. Reverse links and links through another resource are independent. For external event handling, such as forwarding network messages to linked agents, read a fresh snapshot for each event. Session observers can also query their supplied snapshot after commits or cursor changes. The query exposes relationships without granting access to private state or expanding a model request's operation scope.

## Add a model operation

Use a resource tool when an operation targets a linked object. A shared tool can have implementations for different resource types, each with an appropriate internal target and result.

Use a top-level tool for operations on the execution context or shared resource lifecycle, such as creation and renaming. The host supplies caller identity and execution scope.

Describe the operation's purpose and observable behavior. Parameters should explain business meaning that names and types alone do not express. Results should distinguish known success, failure, cancellation, partial output, and uncertain effects.

A tool contribution can capture resource-specific configuration and access at the start of each model request. Return a bound contribution using the same implementation contract; the host uses it for that request's tool batch. This is useful for a resource whose selected network or reachable objects can change while a model is responding. Capture addressing and authorization facts, while reading ordinary mutable content when the operation runs.

## Connect other interactions

Typed calls connect request and response between services or views. Events announce transient changes. Object channels support sustained data such as an interactive screen.

An action or service call is not automatically a model tool. Expose it deliberately when the model needs that operation.

## Use shell capabilities

Backend plugins access shell profiles, one-shot execution, and interactive terminals through `plugin.shell`. Profiles are shared host configuration: `profiles.get()` reads that configuration, while `profiles.list()` resolves executable availability. Plugins choose how to expose these capabilities through their resources and tools.

Use `shell.execute(cwd, args, options)` for a noninteractive command with piped output, progress, and a final result. Each execution owns its process; cancellation or timeout stops that execution without undoing completed effects.

Use `shell.terminals.create(config, events)` for a persistent interactive session. Start the returned handle when needed and register its disposal with the owning resource or plugin lifetime. Closing a terminal permits reopening the handle; disposing it releases it permanently. Input and readiness waits are separate operations, and cancelling a wait leaves the shell running.

A terminal can serve several views through its typed input/output messages. Plugins connect viewers through object channels and choose their own presentation. Backend reads expose screen text, retained output, or character-cell image data. The host owns the PTY and screen state; a terminal handle does not create a workbench resource or model tool by itself.
