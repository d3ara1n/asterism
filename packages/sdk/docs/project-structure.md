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

## Separate source inputs from delivered code

The package root owns identity, release metadata, translations, and manual declarations. Its `asterism.artifact` selects generated loading metadata; `asterism.build` holds source inputs. Keeping those roles separate lets a source checkout and a published package use the same loader without requiring the application to transform TypeScript.

Owned public entries use exact import specifiers mapped to source files separately for runtime and renderer. Compile each realm's implementation and owned public entries together so the provider uses the same declarations as its consumers. A separate authoring API package can supply types without becoming a separately activated plugin.

Classify consumer imports of other plugin APIs with `publicDependencies`. Those imports stay external throughout the bundled graph and resolve to the enabled provider's native ESM exports. Backend and renderer graphs are separate: identity is shared within a realm, not memory shared between processes or with the browser.

Bundle ordinary private implementation libraries when appropriate. Keep a backend dependency external when it must retain its installed layout, native binary, or package-relative files; declare that choice in `runtimeExternals` and ship its ordinary dependency installation. Assets copied by the build belong to completed output. Root documentation and translation metadata remain with the package rather than moving into executable loading metadata.

## Keep service ownership with the provider

A provider owns shared initialization and cleanup. Consumers depend on the capability they use and release their own subscriptions or requests without ending services shared by others.

Keep that ownership explicit when composing modules. A dependency should explain why a capability is needed, not require consumers to understand the provider's file layout or startup internals.
