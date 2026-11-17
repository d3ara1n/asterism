# Asterism SDK

The SDK is the shared boundary between Asterism and plugins. It supplies generic hosting capabilities while plugins own the meaning of their resources and workflows. Agent conversation and other paradigm-specific behavior belong to the plugin that implements them.

## Design against a shared boundary

Use public contracts to share meaning without importing another implementation. Their runtime identity matters as well as their TypeScript shape. Public abstractions should express capabilities consumers need, not reproduce internal decomposition.

Keep backend work and frontend presentation separate while making each capability's ownership understandable. The host composes contributions; it does not infer domain behavior from a plugin's private state.

## Develop for the target application

Use a compatible SDK version for development and treat the running application as the runtime provider. Development dependencies supply declarations; peer dependencies express the host-provided relationship. Installing a newer SDK does not upgrade the application's capabilities.

Validate both contract agreement and actual integration. Type checking cannot establish that a distributed plugin includes all required assets, works in the intended application, or releases the work it owns.

## Deliver an explicit build

Use `@asterism-app/plugin-build` as an authoring dependency and run its `asterism-plugin-build` CLI explicitly. Source entries belong under `asterism.build`; `asterism.artifact` selects the generated artifact loaded by the application. Build, add the package directory, and restart. Later source changes require another build and restart, not a different plugin mode.

Supported host imports stay external. Classify other plugins' public packages in `publicDependencies` so the artifact retains imports of the provider's actual ESM exports. Keep private backend packages external only when their installed layout or native resources require it, and include those dependencies in the delivered installation.

Build before packing and inspect the tarball. Typechecking and a successful build do not establish installed-application or platform compatibility.

## Keep authoring material purposeful

The package includes prose guides and maintained source examples. Guides explain mental models, ownership, integration choices, and working principles; public declarations and examples carry concrete interfaces and assembly. The complete counter package provides a small design to adapt, not a required architecture for every plugin.

These materials support software use and plugin development on demand. Runtime tool descriptions, guidelines, and schemas own tool invocation knowledge independently of the manual.
