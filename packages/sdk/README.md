# Asterism SDK

The SDK defines the shared language between Asterism and plugins: contracts, host capabilities, and contributions.

Pure declarations can be shared across execution environments. Backend interfaces support work and persistence; frontend interfaces support presentation and interaction.

The SDK describes generic mechanisms. Agent conversation, naming, and other domain behavior belong to the plugin that implements them.

Public interfaces should express a capability an author needs. Internal decomposition is not itself a reason to expose another abstraction.

## Authoring material

The source package includes `docs/` for plugin development guides and `examples/` for public API usage. `examples/counter/` is a complete starter package; the other examples are focused fragments to compose into a plugin. The application's manual exposes these directories directly.

Examples participate in repository type checking. Internal compile-time counterexamples live in `typechecks/` and are excluded from package contents and the manual. Built-in domain guides and examples belong to `@asterism/builtin-api`.
