# Prepare for plugin development

Plugin development starts with a capability users need, not a complete framework of extension points. Build one useful path through the application, then add other contributions when that path requires them.

## Target a real application

Choose the application release your plugin supports and develop against compatible public packages. Development declarations help the editor and type checker; they do not upgrade the APIs supplied by a running application. Use the exact development-dependency pins in the complete examples supplied by that target application, or its release's listed public-package versions. Release preparation pairs those examples with their target build. Registry tags such as `latest` and `next` identify channel heads, not the appropriate declarations for every installed or development application.

Validate a copied project outside the application checkout. Workspace dependencies can hide missing authoring dependencies; an independent install and typecheck reveal what an external author actually receives.

Host-provided public packages are shared boundaries, not private libraries to bundle into a plugin. Declare them, and other plugins' public packages you import, as peer dependencies; add development dependencies for the declarations the editor reads. The build keeps peer imports external so they bind to the running application's instances or the enabled provider. Ordinary private libraries remain the plugin's dependencies.

Preserve imports of original shared contracts. A copied declaration can look identical in TypeScript while no longer identifying the same operation at runtime.

## Build a narrow vertical slice

Start with the plugin's business state, the operation that changes or reads it, and the smallest presentation needed to use it. Keep shared declarations independent of backend and frontend implementations. This makes the boundary visible without exposing implementation details as public API.

Choose a stable plugin identity before sharing the package. Treat its display name and release version as product information, distinct from the contracts and namespace that identify its behavior.

Avoid scaffolding unused services, views, and persistence. A small working capability makes ownership and cleanup easier to verify; an empty abstraction says little about whether the plugin works.

## Build before loading

A plugin directory contains package metadata and a completed artifact in `dist`. Source entries are authoring inputs under `asterism.build`. The official `@asterism-app/plugin-build` package supplies the `asterism-plugin-build` command. Keep it as a development dependency and expose an explicit package build script.

Install authoring dependencies, typecheck, and build before adding the package directory to Asterism. Then restart to activate the selection. Repeat the build and restart after source changes. A checkout is a user-owned package directory, not a separate plugin mode: the application neither compiles changed source at startup nor silently substitutes source when output is missing.

A successful build replaces `dist` as a whole; a failed build leaves the previous output. Restart a running application after building, because it may still load parts of the replaced output lazily.

## Validate distinct boundaries

Type checking establishes agreement with the declarations. Loading and exercising the plugin in the target application establishes whether its contributions and dependencies work together. Neither replaces the other.

Check the normal path, meaningful invalid input, visible failures, and cleanup when the owning resource or plugin ends. Reopen saved work to distinguish durable state from accidental reliance on a live instance.

## Verify what users receive

Test the distributed package in an installed application, not only the source checkout. Build before packing, and inspect the actual tarball. Use a clean release checkout. Include the completed output, root metadata, documentation, and translation catalogs, and declare every package the plugin imports at runtime in `dependencies` or `peerDependencies`. Installation must not need to compile plugin source. Files available only on the author's machine should not be necessary.

Update public package versions intentionally and repeat the relevant integration checks. A compatible editor view is useful evidence, but the application remains the provider of runtime capabilities.
