# Make the shared UI package internal

Filed: 2026-11-25
Status: In progress. The directory diff panel and text-tool diff preview use the SDK `Diff`. Other builtin views still use the private UI package.

## Boundary

The SDK defines how plugins contribute to workbench surfaces such as islands and tool views. Shared controls are optional, composable capabilities, not plugin-specific views or a required UI library. A control owns generic behavior such as diff highlighting; its consumer owns the toolbar, preferences, and layout. Plugins can supply their own controls, dependencies, and scoped styles. The host's UI implementation and CSS build are not plugin interfaces.

## Current state

- The plugin builder treats every `@asterism-app/ui/*` subpath as a renderer host module (`packages/plugin-build/src/artifact.ts`, `sharedUiPackage`), so any plugin that declares the package as a peer can import its internals.
- Builtin is built like any other plugin and still declares `@asterism-app/ui` as a peer. Its source is also included in the host's Tailwind scan; this is not how separately built plugins get styles.

## Work

1. Classify remaining builtin imports: workbench mechanisms, useful generic controls, and UI that belongs to the plugin. Promote controls on their merits, not to reproduce the private export list.
2. Migrate real consumers in groups, preserving their behavior. Use SDK-owned props for shared controls, and use plugin-owned components and styles where appropriate.
3. Once builtin no longer imports the private package, drop its `@asterism-app/ui` peer. Remove the generated shared UI module table. Keep `@asterism-app/ui` reserved in the builder but provide no plugin entry points for it. Update builder integration fixtures and `docs/development/architecture.md`.

## Acceptance

- A plugin importing `@asterism-app/ui/*` fails to build with a diagnostic, whether declared as a peer or a regular dependency.
- Builtin builds and loads without private Asterism UI imports. The directory diff keeps wrap control and word-level highlighting.
- A separately built plugin can use workbench mechanisms and mix SDK controls with its own controls and styles.
- Typechecks, focused tests, and the opt-in plugin integration suite pass; the user accepts the migrated views visually.
