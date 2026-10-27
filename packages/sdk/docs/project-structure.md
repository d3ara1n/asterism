# Organize a plugin

A plugin is the unit of installation, identity, settings, and lifetime. Its internal modules group capabilities that share that ownership.

## Separate responsibilities

Shared contracts describe transferable data and operations. Backend implementations perform work. Frontend views present state and collect input.

Keep shared declarations independent of backend-only or frontend-only libraries. A view reaches its backend through typed communication rather than importing the backend implementation.

Group a capability's declarations, implementation, and presentation so they remain understandable together. Compose capabilities at the plugin entry through explicit dependencies.

## Use public extension points

The general SDK supplies host services and contribution interfaces. Built-in domain APIs expose extensions specific to existing features, such as Agent interaction.

Use a domain extension when adding to that feature. A plugin with its own resource can define its own behavior and presentation.

## Share contracts and services

A public package can expose declarations or services for other plugins. Consumers declare ordinary package dependencies in `package.json` and import the original public values. The host derives initialization and cleanup dependencies from those imports, including imports through intermediate packages.

Expose shared values through `./public` in the package's standard exports. Public imports bind to the enabled provider's actual exports, including imports through intermediate npm packages. The host uses the import graph for initialization order and reports missing exports or unavailable providers. Package versions and dependency ranges remain package-management metadata; local development copies do not replace the active provider.

A shared declaration has runtime identity as well as a name. Copying it under the same name does not establish shared identity. Backend and frontend environments are separate even when they use the same contract.

Shared service initialization and cleanup belong to the provider. A consumer should depend on the capability it needs rather than the provider's internal organization.
