# Prepare for plugin development

A plugin adds resources, tools, views, settings pages, Home entries, or services through Asterism's public software development kit (SDK). Development includes preparing a compatible package, verifying its capabilities and lifecycle in the application, and checking the packaged result before sharing it.

## Prepare a project

Use a TypeScript package and the public SDK compatible with the application you intend to run. A package declaration identifies the plugin and its backend, frontend, and optional storage entries.

Set the plugin's release version in `package.json.version`. That version identifies distributed releases and updates; it does not affect loading or execution. The runtime definition declares its namespace and behavior. Keep ordinary runtime libraries in `dependencies`; npm or another package manager installs them using its usual dependency and lockfile rules.

Declare host-provided packages such as `@asterism-app/sdk` in `peerDependencies` with `"*"`. The running plugin always uses the host's instance, so a narrower range adds maintenance without changing behavior. Install a version of the SDK compatible with the target application in `devDependencies` for editor support and type checking. Extensions to built-in features can use the same arrangement for `@asterism-app/builtin-api`.

npm distribution tags follow the application's release channels: `latest` matches the newest stable application and `next` matches the newest preview application. Install the tag for the application you target, for example `npm install --save-dev --save-exact @asterism-app/sdk@latest`; add `@asterism-app/builtin-api` with the same tag when using built-in domain APIs. Saving an exact version keeps the declarations stable until an intentional update. The packages include TypeScript source, guides, and examples. Installing a newer package does not update the APIs provided by the running application.

Asterism binds shared public imports to the active host or plugin provider. Dependency ranges do not reject loading; missing modules, missing exports, invalid contributions, and initialization errors produce loading failures. Check the APIs your plugin actually uses with TypeScript and exercise them in the target application.

The `asterism` field declares a namespaced `id` and the needed `runtime`, `renderer`, and `storage` entry paths, relative to the package root. Runtime and renderer entries default-export their SDK plugin definitions. The runtime namespace must match the manifest ID. The required `displayName` is the plugin's name wherever the application shows it, including plugin management, settings attribution, and session entries; use a message reference owned by the plugin to localize it. The host reads it from the package without running plugin code, so disabled and failed plugins keep their names.

Keep shared declarations separate from executable backend and frontend code. Backend work can use local system capabilities; frontend code works through the host's view and communication facilities.

The `.test.` filename marker is reserved for tests, such as `count.test.ts` or `card.test.tsx`. Tests can remain alongside implementation files. Automatic shared-module discovery and application/package distribution exclude `*.test.*`; runtime entries and their imports contain application code only. Plugin compilation reports explicit imports of test files or Vitest instead of silently removing dependencies.

Start with one capability that demonstrates the plugin's purpose. Add further parts when that capability needs them rather than creating an empty framework in advance.

## Load and verify

Prepare the package and its dependencies, run its type checks, then add its local package directory in Asterism's plugin settings. Restart to load changes.

The host compiles TypeScript, TSX, and imported CSS at startup. A separate JavaScript build is optional. Generate CSS with the plugin's own toolchain first when using Tailwind, Sass, or another preprocessor. Source changes take effect after restart.

Check the reported loading state and exercise the capability. Verify its normal result, meaningful errors, and cleanup when an object disappears or the application closes.

Type checking establishes interface consistency. Actual loading and use establish whether the package works in the intended host.

## Prepare for sharing

Include the entries, assets, and dependencies the package needs. Preserve imports of shared public contracts so the host and consumers use the same declarations.

Test the resulting package in an installed application. Development files available on the author's machine should not be necessary to use the distributed plugin.
