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

`asterism.artifact` points to the generated `dist/plugin.json`. The source entry belongs in `asterism.build`, not in the loading metadata. A failed build does not publish a replacement pointer. Keep completed builds referenced by a running application until that application's use has ended.

`npm run watch` keeps the author-side builder running. A successful watched rebuild still takes effect in Asterism only after restart; it is not application hot reload.

## Declare the provider, not a private copy

`asterism.build.publicDependencies` explicitly includes `@asterism-app/builtin-api`. This classifies all imports from that package, including subpaths reached through bundled helpers, as public provider imports. The emitted imports remain external and bind to builtin's actual exports. Peer dependencies alone do not supply this classification.

Development dependencies provide declarations; they do not install or activate the running builtin implementation. A missing or unavailable provider is a loading failure, not a reason to use a consumer-local copy of its contracts. The builder also keeps SDK and other supported host imports external so shared values retain their identity.

When adapting the renderer fragment, select a renderer entry that assembles it into your plugin. Keep the builtin public dependency declaration: its renderer exports belong to the provider just as its backend contracts do. Private backend packages with native or package-relative resources instead belong in normal dependencies and, when kept outside the bundle, in `runtimeExternals`.

## Check the delivered package

Build before packing, and inspect `npm pack --dry-run`. Include the published pointer and selected completed output, not only these source files. Distribution must not depend on an installation script compiling the plugin. Loading in the intended application is a separate integration check from typechecking and artifact generation; it is not established merely by copying this example.
