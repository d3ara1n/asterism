# Make the shared UI package internal

Filed: 2026-11-25
Status: Deferred. The user decided that plugins depend only on the SDK and that `@asterism-app/ui` becomes an internal package; the migration is scheduled separately.

## Current state

- The plugin builder treats every `@asterism-app/ui/*` subpath as a renderer host module (`packages/plugin-build/src/artifact.ts`, `sharedUiPackage`), so any plugin that declares the package as a peer can import its internals.
- The builtin plugin is built like any other plugin and declares `@asterism-app/ui` as a peer. It imports about 50 subpaths; the most frequent are `ui/button`, `tooltip-hint`, `utils`, `ui/spinner`, `messages/common`, `ui/status`, `tool-header`, `ui/icon-button`, `tool-content`, and `code-view`.
- The package exports `.tsx` sources with extensionless relative imports, so a plugin type-checked with `nodenext` cannot consume it; only the host's bundler-mode renderer config can.
- The SDK renderer exposes host-bound controls through `RendererUiProvider`: `HeaderExcerpt`, `StreamingScrollArea`, `ToolHeader`, `ToolResourceSubject`, `ToolScrollArea`, and `CodeDiff`. Their props are SDK-owned and do not expose Pierre, Radix, or Tailwind types.

## Work

1. Inventory the controls builtin uses and decide which become SDK renderer controls, which builtin should own privately, and which the host shell should own instead.
2. Add the SDK controls with SDK-owned props, shaped by builtin's actual usage, and bind them in the host.
3. Move builtin to the SDK controls and drop its `@asterism-app/ui` peer.
4. Remove `sharedUiPackage` from the builder's host modules and the generated shared UI module table, and update the builder integration fixtures and `docs/development/architecture.md`.
5. Mark `@asterism-app/ui` internal in its README and in `docs/development/design-system.md`.

## Acceptance

- A plugin importing `@asterism-app/ui/*` fails to build with a diagnostic.
- Builtin builds and loads with only SDK and builtin-api peers.
- Typechecks, unit tests, and the opt-in plugin integration suite pass; the user accepts the tool and card views visually.
