# Organize a plugin

A plugin is the unit of installation, identity, settings, and lifetime. Its internal modules group capabilities that share that ownership.

## Separate responsibilities

Shared contracts describe transferable data and operations. Backend implementations perform work. Frontend views present state and collect input.

Keep shared declarations independent of backend-only or frontend-only libraries. A view reaches its backend through typed communication rather than importing the backend implementation.

Group a capability's declarations, implementation, and presentation so they remain understandable together. Compose capabilities at the plugin entry through explicit dependencies.

## Use public extension points

The general SDK supplies host services and contribution interfaces. Built-in domain APIs expose extensions specific to existing features, such as Agent interaction.

Use a domain extension when adding to that feature. A plugin with its own resource can define its own behavior and presentation.

A paradigm plugin can own a Home entry, configuration, request assembly, and execution behavior. The host supplies sessions, concrete model access, interactive terminals, command execution, MCP, provider usage, and raw skill and instruction catalogs. Compose these capabilities according to the workflow; an Agent resource or conversation card is optional.

## Share contracts and services

A public package can expose declarations or services for other plugins. Consumers declare ordinary package dependencies in `package.json` and import the original public values. The host derives initialization and cleanup dependencies from those imports, including imports through intermediate packages.

Expose shared values through `./public` in the package's standard exports. Public imports bind to the enabled provider's actual exports, including imports through intermediate npm packages. The host uses the import graph for initialization order and reports missing exports or unavailable providers. Package versions and dependency ranges remain package-management metadata; local development copies do not replace the active provider.

For a separate API library, declare its package name in the implementation plugin's `asterism.publicPackages` array. Install that library as an ordinary dependency and declare its public entry points through standard package exports. Consumers resolve those entries from the enabled provider's installation. Package names cannot be claimed by competing enabled providers across these two declaration forms.

Libraries that depend on native binaries or files relative to their installed module can be listed in `asterism.runtimeExternals`. The host preserves their resolved installed locations instead of relocating their code into the plugin cache.

A shared declaration has runtime identity as well as a name. Copying it under the same name does not establish shared identity. Backend and frontend environments are separate even when they use the same contract.

Shared service initialization and cleanup belong to the provider. A consumer should depend on the capability it needs rather than the provider's internal organization.
