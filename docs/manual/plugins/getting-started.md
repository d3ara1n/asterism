# Prepare for plugin development

A plugin adds resources, tools, views, settings, or services through Asterism's public software development kit (SDK). Development includes preparing a compatible package, verifying its capabilities and lifecycle in the application, and checking the packaged result before sharing it.

## Prepare a project

Use a TypeScript package and the public SDK compatible with the application you intend to run. A package declaration identifies the plugin and its backend, frontend, and optional storage entries.

Keep shared declarations separate from executable backend and frontend code. Backend work can use local system capabilities; frontend code works through the host's view and communication facilities.

Start with one capability that demonstrates the plugin's purpose. Add further parts when that capability needs them rather than creating an empty framework in advance.

## Load and verify

Prepare the package and its dependencies, run its type checks, then add its local package directory in Asterism's plugin settings. Restart to load changes.

Check the reported loading state and exercise the capability. Verify its normal result, meaningful errors, and cleanup when an object disappears or the application closes.

Type checking establishes interface consistency. Actual loading and use establish whether the package works in the intended host.

## Prepare for sharing

Include the entries, assets, and dependencies the package needs. Preserve imports of shared public contracts so the host and consumers use the same declarations.

Test the resulting package in an installed application. Development files available on the author's machine should not be necessary to use the distributed plugin.
