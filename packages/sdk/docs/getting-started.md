# Prepare for plugin development

Plugin development starts with a capability users need, not a complete framework of extension points. Build one useful path through the application, then add other contributions when that path requires them.

## Target a real application

Choose the application release your plugin supports and develop against compatible public packages. Development declarations help the editor and type checker; they do not upgrade the APIs supplied by a running application.

Host-provided public packages are shared boundaries, not private libraries to bundle into a plugin. Use development dependencies for authoring and peer dependencies to express that relationship. Ordinary runtime libraries remain the plugin's dependencies.

Preserve imports of original shared contracts. A copied declaration can look identical in TypeScript while no longer identifying the same operation at runtime.

## Build a narrow vertical slice

Start with the plugin's business state, the operation that changes or reads it, and the smallest presentation needed to use it. Keep shared declarations independent of backend and frontend implementations. This makes the boundary visible without exposing implementation details as public API.

Choose a stable plugin identity before sharing the package. Treat its display name and release version as product information, distinct from the contracts and namespace that identify its behavior.

Avoid scaffolding unused services, views, and persistence. A small working capability makes ownership and cleanup easier to verify; an empty abstraction says little about whether the plugin works.

## Validate distinct boundaries

Type checking establishes agreement with the declarations. Loading and exercising the plugin in the target application establishes whether its contributions and dependencies work together. Neither replaces the other.

Check the normal path, meaningful invalid input, visible failures, and cleanup when the owning resource or plugin ends. Reopen saved work to distinguish durable state from accidental reliance on a live instance.

## Verify what users receive

Test the distributed package in an installed application, not only the source checkout. Include the entries, generated assets, and dependencies that the plugin actually uses. Files available only on the author's machine should not be necessary.

Update public package versions intentionally and repeat the relevant integration checks. A compatible editor view is useful evidence, but the application remains the provider of runtime capabilities.
