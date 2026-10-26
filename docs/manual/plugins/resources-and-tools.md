# Add resources and tools

A resource represents an object with identity and lifetime. A tool represents a model-callable operation. They can evolve independently.

## Add an object

Use a resource for something that belongs in a session and can be inspected or operated on. Define how it is created, what state it owns, and what information it presents.

The resource's lifetime follows its presence in the session. A hidden card does not imply that its backend instance should stop.

Creation supplies initial state. Actions change the object through typed application or plugin operations. Views present the resulting state.

## Add a model operation

Use a resource tool when an operation targets a linked object. A shared tool can have implementations for different resource types, each with an appropriate internal target and result.

Use a top-level tool when the operation belongs to the execution context without selecting a target resource. The host supplies caller identity and execution scope.

Describe the operation's purpose and observable behavior. Parameters should explain business meaning that names and types alone do not express. Results should distinguish known success, failure, cancellation, partial output, and uncertain effects.

## Connect other interactions

Typed calls connect request and response between services or views. Events announce transient changes. Object channels support sustained data such as an interactive screen.

An action or service call is not automatically a model tool. Expose it deliberately when the model needs that operation.

## Extend an agent

An existing Agent can expose public actions, input preparation, creation entries, and UI extension points. Use those when modifying its interaction.

Creating another agent and granting it resources are explicit operations. The new agent does not automatically inherit every capability of its creator.
