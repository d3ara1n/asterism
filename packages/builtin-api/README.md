# Built-in public API

This package is the public domain boundary shared by Asterism's builtin implementation and external plugins. It lets an integration participate in existing Agent behavior without importing private implementation code.

## Extend without taking ownership

Builtin owns its input admission, conversation history, and Agent execution. An extension owns its business state, external relationships, and presentation contributions. Use this boundary when extending that domain rather than treating the bundled paradigm as a mandatory model for all plugins.

Public declarations retain shared runtime identity across consumers. The package is not a second installed plugin and does not grant access to private objects. Generic hosting capabilities belong to the SDK; builtin-specific capabilities belong here when they are intentionally public.

## Depend on the implementation provider

Develop against compatible SDK and builtin API packages. Development dependencies supply declarations; peer dependencies express the shared provider relationship. Installing the API package does not install or update the builtin implementation that supplies behavior at runtime.

Import original contracts so extensions compose with the provider's operations rather than recreate them by convention. Validate the integration in an application with the intended provider enabled.

## Explain integration choices

The package includes domain guides and source examples. Prose explains when to submit, prepare, observe, or present work and which participant owns each decision. Types and maintained examples express the concrete contracts and composition.

The manual supports users and plugin authors on demand. Tools remain understandable from their own descriptions, guidelines, and schemas without a separate documentation prerequisite.
