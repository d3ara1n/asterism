# Built-in public API

This package exposes domain contracts and extension capabilities shared by Asterism's built-in implementation and external plugins.

It lets a plugin interact with existing Agent behavior, offer creation capabilities, or contribute Agent presentation without importing the implementation.

Public declarations retain their identity across consumers. The package is a shared domain boundary, not a second installed plugin and not a grant of private object access.

General hosting facilities belong to the SDK. Built-in-specific behavior belongs here only when it is intentionally public.

## Installation

Install with `npm install --save-dev --save-exact @asterism-app/sdk@latest @asterism-app/builtin-api@latest` to target the stable application, or use `@next` for both to target the preview application. Declare both packages as peer dependencies with `"*"` in the plugin package.

The package ships TypeScript source. Asterism supplies the built-in public API at runtime, preserving shared declaration identity. Use development versions compatible with the target application; installing these packages does not install or update the built-in implementation.

## Authoring material

The source package includes `docs/` for built-in domain development guides and `examples/` for agent input, input preparation, resource creation, and agent UI extensions. These examples are fragments to compose into a plugin with compatible SDK and built-in API dependencies. They participate in repository type checking.

The application's manual exposes these directories directly. Generic plugin development material and the complete starter package belong to `@asterism-app/sdk`.
