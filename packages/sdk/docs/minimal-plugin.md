# Adapt a small plugin

The SDK's counter package in `examples/counter` is a complete plugin, not a specification for every plugin's structure. Its maintained source shows concrete assembly. Use it to understand ownership and then change the design to fit the capability you need.

## Follow one change through the system

The counter separates a shared declaration, backend work, and a card that presents the result. Backend and frontend import the same contracts; sharing a name or copying a schema would not create the same runtime identity.

An increment updates the current value and records the change together. That is a deliberate product choice: current data supports use now, while the record explains what happened. The counter does not promise that browsing history restores its value. A different resource may need a different relationship between current state and history.

The card initiates work without becoming its durable owner. This separation matters when a view closes, remounts, or fails while the resource remains present. UI pending state belongs to the interaction; committed results belong to the backend.

The model-facing read operation exposes an existing capability rather than inventing a second source of truth. Its registration does not itself grant access to the counter. Treat visibility, authorization, and presentation as separate choices.

## Adapt ownership before adding features

Choose a distinct plugin identity for a new package. Keep shared contracts independent of executable implementations, but group a capability's code so its state transitions remain understandable together.

Decide whether each new piece of state is a current value, a historical fact, a preference, or temporary interaction state. Decide who ends any new asynchronous work. A connection shared by all counters would belong to the plugin; a process meaningful only for one counter would belong to that resource.

A Home entry can start a session around the counter without introducing an Agent or a first message. Keep that independence when adapting the example unless conversation is part of the new plugin's domain.

## Check the adapted design

Use a compatible application and public SDK for development. Type checking checks contract agreement; loading the package and exercising it checks the integration.

Trace one change from the initiating interface to saved state and history. Then check invalid input, visible failure, reopening saved objects, and cleanup. These checks should test promises your resource makes, not merely confirm that the copied example still has the same controls.
