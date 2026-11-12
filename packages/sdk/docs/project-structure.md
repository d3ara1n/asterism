# Organize a plugin

A plugin is a unit of installation, identity, settings, and lifetime. Internal modules group capabilities that share that ownership; they need not become separate public abstractions.

## Separate responsibilities, keep capabilities cohesive

Shared contracts describe transferable data and operations. Backend implementations own work and persistence. Frontend views present state and collect input. Keep shared declarations independent of libraries that belong only to one implementation environment.

A view reaches backend behavior through typed communication rather than importing its implementation. Within that boundary, keep a capability's declarations, behavior, and presentation understandable together. Compose capabilities through explicit dependencies instead of exposing internal layers merely because they exist.

## Choose a domain boundary

Use a domain's public extension points when adding to its existing behavior. A plugin with its own resource can instead own that resource's behavior and presentation. Extending an Agent and implementing a new paradigm are different commitments.

A paradigm may define how work starts, how requests are assembled, and how execution is presented. Sessions and host capabilities do not require a conversation card. Choose the composition that fits the workflow rather than treating the bundled paradigm as the host's mandatory object model.

## Publish only what consumers need

A public package is useful when multiple plugins need the same declarations or service boundary. Publish capabilities with an intentional meaning for consumers, not a mirror of the provider's internal organization.

For a small extension, public exports from the implementation package may be sufficient. A separate API library can make sense when the shared domain has its own authoring surface and should remain independent of implementation imports. Neither choice makes the library a second plugin or gives consumers access to private state.

Import original public values. Shared contracts carry runtime identity as well as types, so a local copy is not a substitute for the provider's declaration. Development package versions support authoring; the enabled provider supplies the running implementation.

## Keep service ownership with the provider

A provider owns shared initialization and cleanup. Consumers depend on the capability they use and release their own subscriptions or requests without ending services shared by others.

Keep that ownership explicit when composing modules. A dependency should explain why a capability is needed, not require consumers to understand the provider's file layout or startup internals.
