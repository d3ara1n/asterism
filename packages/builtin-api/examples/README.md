# Build an Agent observation plugin

This directory is a complete backend-only plugin package. Its build entry is `agent-observation.ts`; the other source files illustrate separate integrations and are typechecked but are not activated by this package. The observer logs accepted input, turn endings, and committed Agent records without owning Agent execution.

## Prepare and register

The manifest pins the public packages for the target application. Run here:

```sh
npm install
npm run typecheck
npm run build
```

Add this directory to Asterism and restart. The builtin implementation provider must be enabled. After source changes, build explicitly and restart; registering a source checkout does not enable startup compilation or live reload.

The build writes `dist/artifact.json` and the emitted files; the source entry belongs in `asterism.build`. A failed build leaves the previous `dist` in place.

## Declare the provider, not a private copy

`@asterism-app/builtin-api` is a peer dependency. The builder therefore keeps all imports from that package external, including subpaths reached through the plugin's helper modules, and the host binds them to builtin's actual exports.

Development dependencies provide declarations; they do not install or activate the running builtin implementation. A missing or unavailable provider is a loading failure, not a reason to use a consumer-local copy of its contracts. The builder also keeps SDK and other supported host imports external so shared values retain their identity.

When adapting the renderer fragment, select a renderer entry that assembles it into your plugin. Keep the builtin peer declaration: its renderer exports belong to the provider just as its backend contracts do. Private packages belong in normal `dependencies`; the backend loads them from the installed package.

## Check the delivered package

Build before packing, and inspect `npm pack --dry-run`. Include `dist`, not only these source files. Distribution must not depend on an installation script compiling the plugin. Loading in the intended application is a separate integration check from typechecking and artifact generation; it is not established merely by copying this example.
