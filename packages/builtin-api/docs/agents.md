# Extend built-in agents

The built-in public API lets plugins interact with Asterism's existing agents through shared action contracts and UI extension points. The contributing plugin owns its business state; the built-in implementation owns the agent's input handling and execution.

## Declare the dependency

Declare `@asterism-app/builtin-api` and `@asterism-app/sdk` in `peerDependencies` with `"*"`; the running application provides the public package instances, and the host does not gate loading on these ranges. For local development, source-package dependencies supply editor types. Import public contracts from the domain package so every participant uses the same declarations.

Examples are TypeScript and TSX fragments for a plugin's backend or renderer. They use public packages; install additional libraries imported by the chosen example, such as Nano ID for submission identities, in the plugin project. A plugin still supplies its manifest and composition entry points.

## Submit input and cancel work

A backend plugin can obtain a session executor from its plugin context and submit input to an agent resource reference. This also works from external event callbacks; a tool invocation is not required. Use a resource's attachment lifetime for an object-owned connection, and pass its cancellation signal into ongoing submissions.

A bridge resource can query a fresh session snapshot for resources directly linked to itself, select agent references, and invoke their public input action. Link direction expresses which resources the receiver can work with. The reverse relationship is independent, and observing a relationship does not expose another plugin's private state.

Each input submission has a submission identity, parts, a delivery mode, and a sender. Reuse the submission identity when retrying the same input. `steer` delivers pending input at a request boundary; `follow` delivers it at a turn boundary. An idle agent starts execution after input admission. A successful submission call means input handling has completed, not that the agent has finished responding.

File parts use content references with explicit read eligibility. Pass the appropriate content source with the action when forwarding files. Cancellation of the submission is separate from cancellation of the agent's independent execution, which has its own public action.

## Prepare incoming input

An external preparer can inspect, replace, or reject input using the original built-in action contract. Its replacement supplies raw action input that will be parsed again. Preparation has read capabilities and does not commit session mutations.

Keep a preparer's scope tied to its business purpose. It does not replace the agent implementation or acquire a private agent executor.

## Extend presentation

Register agent UI extensions during frontend preparation and bind registration to its cancellation signal. Extensions can present controls, supplemental content, overlays, or modal interaction using the built-in presentation components.

The plugin supplies business state for the associated agent and callbacks for user actions. A component becoming invisible does not complete or cancel waiting backend work. Remounting should reread current state, and each submission entry owns its pending and error state.
